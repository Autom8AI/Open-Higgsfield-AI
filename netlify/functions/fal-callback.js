// fal.ai posts completed queue output here. The signature is verified against
// fal's ED25519 JWKS before any Airtable generation record is updated.
const crypto = require('crypto')
const { json, guard } = require('./_kie')
const { persistSuccess, persistFailure } = require('./_fal-generation')
const { resultUrls } = require('./_fal')

const JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json'
const JWKS_TTL_MS = 24 * 60 * 60 * 1000
let jwksCache = []
let jwksFetchedAt = 0

async function jwks() {
  if (jwksCache.length && Date.now() - jwksFetchedAt < JWKS_TTL_MS) return jwksCache
  const response = await fetch(JWKS_URL)
  if (!response.ok) throw new Error(`fal JWKS failed (${response.status})`)
  const data = await response.json()
  jwksCache = Array.isArray(data.keys) ? data.keys : []
  jwksFetchedAt = Date.now()
  return jwksCache
}

function header(event, name) {
  const headers = event.headers || {}
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || ''
}

async function verifyWebhook(event) {
  const requestId = header(event, 'x-fal-webhook-request-id')
  const userId = header(event, 'x-fal-webhook-user-id')
  const timestamp = header(event, 'x-fal-webhook-timestamp')
  const signatureHex = header(event, 'x-fal-webhook-signature')
  if (!requestId || !userId || !timestamp || !signatureHex) return false

  const timestampNumber = Number(timestamp)
  if (!Number.isFinite(timestampNumber) || Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > 300) return false
  if (!/^[0-9a-f]+$/i.test(signatureHex) || signatureHex.length % 2) return false

  const rawBody = String(event.body || '')
  const bodyHash = crypto.createHash('sha256').update(Buffer.from(rawBody, 'utf8')).digest('hex')
  const message = Buffer.from([requestId, userId, timestamp, bodyHash].join('\n'), 'utf8')
  const signature = Buffer.from(signatureHex, 'hex')

  for (const key of await jwks()) {
    if (!key?.x) continue
    try {
      const publicKey = crypto.createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: key.x },
        format: 'jwk',
      })
      if (crypto.verify(null, message, publicKey, signature)) return true
    } catch (error) {
      console.error('[fal-callback] key verification failed', error.message)
    }
  }
  return false
}

function retryLater(message) {
  return json(503, {
    error: message,
    retryable: true,
  })
}

exports.handler = guard('fal-callback', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })
  if (!(await verifyWebhook(event))) return json(401, { error: 'Invalid fal.ai webhook signature' })

  const body = JSON.parse(event.body || '{}')
  const requestId = body.request_id || body.requestId || header(event, 'x-fal-webhook-request-id')
  const endpoint = (event.queryStringParameters || {}).endpoint
  if (!requestId || !endpoint) return json(400, { error: 'Missing fal request id or endpoint' })

  const taskId = `fal:${encodeURIComponent(endpoint)}:${requestId}`
  const status = String(body.status || '').toUpperCase()
  if (status === 'ERROR') {
    const failure = body.error || body.payload?.detail || 'fal.ai generation failed.'
    const stored = await persistFailure(taskId, typeof failure === 'string' ? failure : JSON.stringify(failure))
    if (!stored.stored) return retryLater('The fal.ai queue record is not ready yet.')
    return json(200, { ok: true, stored: true, state: 'fail' })
  }

  const urls = resultUrls(body)
  if (!urls.length) {
    const stored = await persistFailure(taskId, 'fal.ai webhook returned no generated image URL.')
    if (!stored.stored) return retryLater('The fal.ai queue record is not ready yet.')
    return json(200, { ok: true, stored: true, state: 'fail' })
  }

  const stored = await persistSuccess(taskId, urls, body)
  if (!stored.stored) return retryLater('The fal.ai queue record is not ready yet.')
  return json(200, { ok: true, stored: true, state: 'success' })
})