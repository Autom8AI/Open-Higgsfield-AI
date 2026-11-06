// Shared kie.ai transport + model registry + Composio-backed environment checks.
const REGISTRY = require('../../data/models.json')
const composio = require('./_composio')

const JOBS_BASE = 'https://api.kie.ai/api/v1/jobs'
const UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-base64-upload'

const kieKey = () => {
  const key = process.env.KIE_API_KEY || process.env.KIE_AI_API_KEY
  return String(key || '').trim()
}
const hasAirtableCredential = () => Boolean(
  process.env.AIRTABLE_AUTH
  || process.env.AIRTABLE_API_KEY
  || process.env.AIRTABLE_TOKEN
  || process.env.AIRTABLE_PAT
)

// Video-to-video models used by the Remix tab. They take a source video (and
// reference images) instead of a text-only prompt, so they live beside the
// generated registry rather than in it. `single: true` means kie wants a plain
// string instead of an array for that field.
const REMIX_MODELS = [
  {
    id: 'kling-3.0/motion-control',
    label: 'Kling 3.0 Motion Control',
    kind: 'video',
    api: 'jobs',
    remix: 'motion',
    blurb: 'Moves your character with the motion of a source video.',
    images: { param: 'input_urls', max: 1, required: true },
    videos: { param: 'video_urls', max: 1, required: true },
    resolutions: ['720p', '1080p'],
    resolutionDefault: '720p',
    resolutionParam: 'mode',
  },
  {
    id: 'happyhorse/video-edit',
    label: 'HappyHorse Video Edit',
    kind: 'video',
    api: 'jobs',
    remix: 'edit',
    blurb: 'Edit a video from a prompt, with up to 5 reference images.',
    images: { param: 'reference_image', max: 5, required: false },
    videos: { param: 'video_url', max: 1, required: true, single: true },
    resolutions: ['720p', '1080p'],
    resolutionDefault: '1080p',
  },
  {
    id: 'wan/2-7-videoedit',
    label: 'Wan 2.7 Video Edit',
    kind: 'video',
    api: 'jobs',
    remix: 'edit',
    blurb: 'Edit a 2-10 second video with one reference image.',
    images: { param: 'reference_image', max: 1, required: false, single: true },
    videos: { param: 'video_url', max: 1, required: true, single: true },
    resolutions: ['720p', '1080p'],
    resolutionDefault: '1080p',
  },
  {
    id: 'kling-2.6/motion-control',
    label: 'Kling 2.6 Motion Control',
    kind: 'video',
    api: 'jobs',
    remix: 'motion',
    blurb: 'Cheaper motion transfer from a source video onto your character.',
    images: { param: 'input_urls', max: 1, required: true },
    videos: { param: 'video_urls', max: 1, required: true },
    resolutions: ['720p', '1080p'],
    resolutionDefault: '720p',
    resolutionParam: 'mode',
  },
  {
    id: 'wan/2-2-animate-move',
    label: 'Wan 2.2 Animate Move',
    kind: 'video',
    api: 'jobs',
    remix: 'motion',
    blurb: 'Animates your character image with the motion of a source video.',
    images: { param: 'image_url', max: 1, required: true, single: true },
    videos: { param: 'video_url', max: 1, required: true, single: true },
    resolutions: ['720p'],
    resolutionDefault: '720p',
    noPrompt: true,
  },
  {
    id: 'wan/2-2-animate-replace',
    label: 'Wan 2.2 Animate Replace',
    kind: 'video',
    api: 'jobs',
    remix: 'replace',
    blurb: 'Replaces the person in a video with your character.',
    images: { param: 'image_url', max: 1, required: true, single: true },
    videos: { param: 'video_url', max: 1, required: true, single: true },
    resolutions: ['480p', '580p', '720p'],
    resolutionDefault: '480p',
    noPrompt: true,
  },
]

const models = () => [...REGISTRY.models, ...REMIX_MODELS]
const byId = (id) => models().find((m) => m.id === id)

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify(body),
  }
}

const authHeaders = (key = kieKey()) => ({
  Authorization: `Bearer ${String(key || '').trim()}`,
  'Content-Type': 'application/json',
})

// Per-account Kie key is required; callers that have no key fail loudly.
function requireKieKey(key) {
  const resolved = String(key || kieKey() || '').trim()
  if (!resolved) {
    const error = new Error('KIE_KEY_REQUIRED')
    error.code = 'KIE_KEY_REQUIRED'
    throw error
  }
  return resolved
}

function checkEnv({ airtable = false, kie = true } = {}) {
  // Airtable storage flows through Composio; Kie generation uses each signed-in
  // account's own Kie key from the App Auth table, so the only server-side
  // requirement is that the Composio credential exists (and the airtable
  // toolkit is connected when storage is checked).
  const missing = []
  if (!composio.hasComposio()) missing.push('COMPOSIO_API_KEY')
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
    headers: authHeaders(requireKieKey(key)),
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
  return uploadBase64(media, `higgsfield-${i}-${Date.now()}.${ext}`, key)
}

async function createTask(modelId, input, callBackUrl, key) {
  const payload = { model: modelId, input }
  if (callBackUrl) payload.callBackUrl = callBackUrl
  const res = await fetch(`${JOBS_BASE}/createTask`, {
    method: 'POST',
    headers: authHeaders(requireKieKey(key)),
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
  const res = await fetch(url, { headers: authHeaders(requireKieKey(key)) })
  const data = await res.json().catch(() => ({}))
  const record = data.data || {}
  let urls = []
  try {
    const r = JSON.parse(record.resultJson || '{}')
    urls = r.resultUrls || r.result_urls || r.data?.result_urls || r.originUrls || r.origin_urls || []
  } catch {}
  return {
    state: record.state,
    urls,
    credits: record.creditsConsumed,
    error: record.failMsg,
    raw: record,
  }
}

module.exports = {
  json, denied, models, byId, authHeaders, checkEnv, guard, requireKieKey,
  createTask, getTask, toHostedUrl, uploadBase64, kieKey,
}
