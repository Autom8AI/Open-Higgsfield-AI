// Shared kie.ai transport + model registry.
const REGISTRY = require('../../data/models.json')

const JOBS_BASE = 'https://api.kie.ai/api/v1/jobs'
const UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-base64-upload'

const kieKey = () => process.env.KIE_API_KEY || process.env.KIE_AI_API_KEY
const hasAirtableCredential = () => Boolean(
  process.env.AIRTABLE_AUTH
  || process.env.AIRTABLE_API_KEY
  || process.env.AIRTABLE_TOKEN
  || process.env.AIRTABLE_PAT
)

const models = () => REGISTRY.models
const byId = (id) => models().find((m) => m.id === id)

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    },
    body: JSON.stringify(body),
  }
}

const authHeaders = (key = kieKey()) => ({
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
})

function checkEnv({ airtable = false, kie = true } = {}) {
  const missing = []
  if (kie && !kieKey()) missing.push('KIE_API_KEY')
  if (airtable && !hasAirtableCredential()) missing.push('AIRTABLE_AUTH')
  if (!missing.length) return null
  return json(500, {
    error: `Missing environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`,
    detail: 'Set it in Netlify under Site configuration → Environment variables, then redeploy.',
  })
}

function guard(name, fn) {
  return async (event, context) => {
    try {
      return await fn(event, context)
    } catch (err) {
      console.error(`[${name}]`, err)
      return json(500, {
        error: `${name} failed: ${err.message}`,
        detail: (err.stack || '').split('\n').slice(0, 4).join('\n'),
      })
    }
  }
}

function denied() {
  return null
}

async function uploadBase64(dataUrl, fileName, key) {
  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: authHeaders(key),
    body: JSON.stringify({
      base64Data: dataUrl,
      uploadPath: 'content-factory',
      fileName,
    }),
  })
  const raw = await res.text()
  let data = {}
  try { data = JSON.parse(raw) } catch {}
  const url = data.downloadUrl || data.data?.downloadUrl || data.url || data.data?.url
  if (!url) throw new Error(`Media upload failed (${res.status}): ${data.msg || data.message || raw.slice(0, 300)}`)
  return url
}

function mediaExtension(dataUrl) {
  const mime = String(dataUrl || '').match(/^data:([^;,]+)/i)?.[1]?.toLowerCase() || ''
  return ({
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
  })[mime] || 'bin'
}

async function toHostedUrl(media, i, key) {
  if (typeof media !== 'string' || !media) throw new Error('Invalid media')
  if (media.startsWith('http')) return media
  const ext = mediaExtension(media)
  return uploadBase64(media, `cf-${i}-${Date.now()}.${ext}`, key)
}

async function createTask(modelId, input, callBackUrl, key) {
  const payload = { model: modelId, input }
  if (callBackUrl) payload.callBackUrl = callBackUrl
  const res = await fetch(`${JOBS_BASE}/createTask`, {
    method: 'POST',
    headers: authHeaders(key),
    body: JSON.stringify(payload),
  })
  const raw = await res.text()
  let data = {}
  try { data = JSON.parse(raw) } catch {}
  if (!res.ok || ![200, 505].includes(data.code)) {
    throw new Error(`createTask(${modelId}) rejected (${res.status}/${data.code}): ${data.msg || data.message || raw.slice(0, 300)}`)
  }
  if (!data.data?.taskId) throw new Error(`createTask(${modelId}) returned no taskId: ${raw.slice(0, 300)}`)
  return data.data.taskId
}

async function getTask(taskId, key) {
  const url = new URL(`${JOBS_BASE}/recordInfo`)
  url.searchParams.set('taskId', taskId)
  const res = await fetch(url, { headers: authHeaders(key) })
  const data = await res.json().catch(() => ({}))
  const record = data.data || {}
  let urls = []
  try { urls = JSON.parse(record.resultJson || '{}').resultUrls || [] } catch {}
  return {
    state: record.state,
    urls,
    credits: record.creditsConsumed,
    error: record.failMsg,
    raw: record,
  }
}

module.exports = {
  json, denied, models, byId, authHeaders, checkEnv, guard,
  createTask, getTask, toHostedUrl, uploadBase64, kieKey,
}
