const { json, guard } = require('./_kie')
const { requireAccount, accountProviderKeys } = require('./_auth')

const INITIATE_URL = 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3'

function safeFileName(value) {
  const name = String(value || 'upload.bin').split(/[\\/]/).pop() || 'upload.bin'
  return name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'upload.bin'
}

exports.handler = guard('upload-ticket', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const auth = await requireAccount(event)
  if (auth.error) return json(auth.error.statusCode, auth.error.body)

  const fal = accountProviderKeys(auth.account).fal
  if (!fal) return json(403, { error: 'FAL_KEY_REQUIRED' })

  const body = JSON.parse(event.body || '{}')
  const fileName = safeFileName(body.fileName)
  const contentType = String(body.contentType || 'application/octet-stream').trim() || 'application/octet-stream'

  const response = await fetch(INITIATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Key ${fal}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Fal-Object-Lifecycle': JSON.stringify({ expiration_duration_seconds: 86400 }),
    },
    body: JSON.stringify({ file_name: fileName, content_type: contentType }),
  })

  const raw = await response.text()
  let data = {}
  try { data = raw ? JSON.parse(raw) : {} } catch {}
  if (!response.ok || !data.upload_url || !data.file_url) {
    throw new Error(`fal upload initiation failed (${response.status}): ${data.detail || data.error || data.message || raw.slice(0, 300)}`)
  }

  return json(200, {
    ok: true,
    uploadUrl: data.upload_url,
    fileUrl: data.file_url,
    method: 'PUT',
    contentType,
    expiresIn: 86400,
  })
})