const FAL_QUEUE_BASE = 'https://queue.fal.run'

const falKey = (override) => String(override || process.env.FAL_KEY || process.env.FAL_API_KEY || '').trim()

function requireFalKey(json, override) {
  if (falKey(override)) return null
  return json(500, {
    error: 'Missing fal.ai API key.',
    detail: 'Add a fal.ai API key to the signed-in account or configure FAL_KEY in Netlify.',
  })
}

const authHeaders = (override) => ({
  Authorization: `Key ${falKey(override)}`,
  Accept: 'application/json',
})

const submitHeaders = (override) => ({
  ...authHeaders(override),
  'Content-Type': 'application/json',
})

function queueUrls(endpoint, requestId) {
  const requestBase = `${FAL_QUEUE_BASE}/${endpoint}/requests/${encodeURIComponent(requestId)}`
  return {
    statusUrl: `${requestBase}/status`,
    responseUrl: requestBase,
    legacyResponseUrl: `${requestBase}/response`,
    cancelUrl: `${requestBase}/cancel`,
  }
}

function trustedQueueUrl(value) {
  if (!value) return ''
  try {
    const url = new URL(String(value))
    if (url.protocol !== 'https:' || url.hostname !== 'queue.fal.run') return ''
    return url.toString()
  } catch {
    return ''
  }
}

async function readResponse(res) {
  const raw = await res.text()
  let data = {}
  try { data = raw ? JSON.parse(raw) : {} } catch {}
  return { raw, data }
}

function responseError(label, res, data, raw) {
  const detail = data?.detail || data?.error || data?.message || raw.slice(0, 400)
  const error = new Error(`${label} failed (${res.status}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
  error.status = res.status
  error.data = data
  return error
}

async function parseResponse(res, label) {
  const parsed = await readResponse(res)
  if (!res.ok) throw responseError(label, res, parsed.data, parsed.raw)
  return parsed.data
}

async function getJson(url, key, label) {
  const res = await fetch(url, { method: 'GET', headers: authHeaders(key) })
  const parsed = await readResponse(res)
  return { res, ...parsed, label, url }
}

function uniqueUrls(values) {
  return [...new Set(values.map(trustedQueueUrl).filter(Boolean))]
}

function isPendingResponse(entry) {
  if ([202, 409, 425].includes(entry.res.status)) return true
  const text = `${entry.raw} ${JSON.stringify(entry.data || {})}`
  return entry.res.status === 400 && /not ready|pending|queued|in[_ -]?queue|in[_ -]?progress|processing/i.test(text)
}

async function submit(endpoint, input, webhookUrl, key) {
  const url = new URL(`${FAL_QUEUE_BASE}/${endpoint}`)
  if (webhookUrl) url.searchParams.set('fal_webhook', webhookUrl)
  const res = await fetch(url, {
    method: 'POST', headers: submitHeaders(key), body: JSON.stringify(input),
  })
  const data = await parseResponse(res, `fal submit ${endpoint}`)
  const requestId = data.request_id || data.requestId
  if (!requestId) throw new Error(`fal submit ${endpoint} returned no request_id`)

  const fallback = queueUrls(endpoint, requestId)
  return {
    requestId,
    statusUrl: trustedQueueUrl(data.status_url || data.statusUrl) || fallback.statusUrl,
    responseUrl: trustedQueueUrl(data.response_url || data.responseUrl) || fallback.responseUrl,
    cancelUrl: trustedQueueUrl(data.cancel_url || data.cancelUrl) || fallback.cancelUrl,
    raw: data,
  }
}

async function status(endpoint, requestId, key, statusUrl, responseUrl) {
  const fallback = queueUrls(endpoint, requestId)
  const hasAuthoritativeUrl = Boolean(trustedQueueUrl(statusUrl) || trustedQueueUrl(responseUrl))
  const statusCandidates = uniqueUrls([statusUrl, fallback.statusUrl])
  const failures = []

  for (const url of statusCandidates) {
    const entry = await getJson(url.includes('?') ? url : `${url}?logs=1`, key, `fal status ${endpoint}`)
    if (entry.res.ok) return entry.data
    failures.push(entry)
    if (![404, 405].includes(entry.res.status)) throw responseError(entry.label, entry.res, entry.data, entry.raw)
  }

  const resultCandidates = uniqueUrls([
    responseUrl,
    fallback.responseUrl,
    fallback.legacyResponseUrl,
  ])

  for (const url of resultCandidates) {
    const entry = await getJson(url, key, `fal result probe ${endpoint}`)
    if (entry.res.ok) {
      const urls = resultUrls(entry.data)
      const normalized = String(entry.data?.status || '').toUpperCase()
      if (urls.length || normalized === 'COMPLETED') {
        return {
          status: 'COMPLETED',
          request_id: requestId,
          response_url: url,
          _inlineResult: entry.data,
        }
      }
      if (normalized) return entry.data
    }
    if (isPendingResponse(entry)) {
      return { status: 'IN_QUEUE', request_id: requestId, response_url: url }
    }
    failures.push(entry)
    if (![404, 405].includes(entry.res.status)) throw responseError(entry.label, entry.res, entry.data, entry.raw)
  }

  if (!hasAuthoritativeUrl && failures.length && failures.every((entry) => [404, 405].includes(entry.res.status))) {
    return {
      status: 'IN_QUEUE',
      request_id: requestId,
      _legacyQueueUrlsMissing: true,
    }
  }

  const detail = failures.map((entry) => `${entry.res.status} ${entry.url}`).join('; ')
  throw new Error(`fal status ${endpoint} could not be retrieved. Tried: ${detail}`)
}

async function result(endpoint, requestId, key, responseUrl) {
  const fallback = queueUrls(endpoint, requestId)
  const candidates = uniqueUrls([
    responseUrl,
    fallback.responseUrl,
    fallback.legacyResponseUrl,
  ])
  const failures = []

  for (const url of candidates) {
    const entry = await getJson(url, key, `fal result ${endpoint}`)
    if (entry.res.ok) return entry.data
    failures.push(entry)
    if (isPendingResponse(entry)) throw new Error(`fal result ${endpoint} is not ready yet`)
    if (![404, 405].includes(entry.res.status)) throw responseError(entry.label, entry.res, entry.data, entry.raw)
  }

  const detail = failures.map((entry) => `${entry.res.status} ${entry.url}`).join('; ')
  throw new Error(`fal result ${endpoint} could not be retrieved. Tried: ${detail}`)
}

function mediaUrl(value) {
  return typeof value === 'string' ? value : value?.url
}

function resultUrls(data) {
  const body = data?.payload || data?.data || data || {}
  const values = []
  if (Array.isArray(body.images)) values.push(...body.images)
  if (body.image) values.push(body.image)
  if (Array.isArray(body.videos)) values.push(...body.videos)
  if (body.video) values.push(body.video)
  if (Array.isArray(body.audios)) values.push(...body.audios)
  if (body.audio) values.push(body.audio)
  if (Array.isArray(body.resultUrls)) values.push(...body.resultUrls)
  return [...new Set(values.map(mediaUrl).filter(Boolean))]
}

module.exports = { falKey, requireFalKey, submit, status, result, resultUrls }