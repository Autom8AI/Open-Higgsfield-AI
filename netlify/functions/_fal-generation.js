const { GENERATIONS, listRecords, updateRecord } = require('./_airtable')
const { status: falStatus, result: falResult, resultUrls } = require('./_fal')

function parseFalTaskId(taskId) {
  const value = String(taskId || '')
  if (!value.startsWith('fal:')) return null
  const parts = value.split(':')
  if (parts.length < 3) return null
  const requestId = parts.pop()
  const endpointEncoded = parts.slice(1).join(':')
  if (!requestId || !endpointEncoded) return null
  return { endpoint: decodeURIComponent(endpointEncoded), requestId }
}

function escapeFormula(value) {
  const slash = String.fromCharCode(92)
  return String(value).split("'").join(`${slash}'`)
}

function extFor(url) {
  const match = /\.(mp4|mov|webm|m4v|gif|png|jpe?g|webp|avif|mp3|wav|m4a)(?:\?|$)/i.exec(url || '')
  if (match) return match[1].toLowerCase().replace('jpeg', 'jpg')
  return /video/i.test(String(url || '')) ? 'mp4' : 'png'
}

function recordParams(record) {
  try { return JSON.parse(record?.fields?.Params || '{}') } catch { return {} }
}

function mediaUrls(record) {
  return (Array.isArray(record?.fields?.Media) ? record.fields.Media : [])
    .map((attachment) => attachment?.url)
    .filter(Boolean)
}

function resultBody(raw) {
  return raw?.payload || raw?.data || raw || {}
}

function rounded(value) {
  return Math.round(Number(value || 0) * 10) / 10
}

function inferFalCredits(params, raw) {
  const body = resultBody(raw)
  const direct = Number(body.credits || body.cost?.credits || body.usage?.credits || 0)
  if (direct > 0) return rounded(direct)

  const model = String(params._model || '')
  if (model === 'alibaba/happy-horse/video-edit') {
    const video = body.video || body.output?.video || {}
    const duration = Number(video.duration || body.duration || 0)
    if (!duration) return undefined
    const rate = String(params.resolution || '1080p').toLowerCase() === '720p' ? 14 : 28
    return rounded(duration * rate)
  }

  if (model === 'fal-ai/flux-pro/kontext') return 4

  if (model === 'fal-ai/flux-lora') {
    const image = (Array.isArray(body.images) ? body.images[0] : body.image) || {}
    const width = Number(image.width || body.width || 0)
    const height = Number(image.height || body.height || 0)
    if (width > 0 && height > 0) {
      const billedMegapixels = Math.max(1, Math.ceil((width * height) / 1_000_000))
      return rounded(billedMegapixels * 3.5)
    }
    return Number(params._credits || 3.5)
  }

  return undefined
}

function addResultMetadata(params, raw) {
  const body = resultBody(raw)
  const video = body.video || body.output?.video || null
  if (video) {
    const duration = Number(video.duration || 0)
    if (duration > 0) {
      params.duration = duration
      params._duration = duration
    }
    if (video.width) params._outputWidth = Number(video.width)
    if (video.height) params._outputHeight = Number(video.height)
  }
  const image = (Array.isArray(body.images) ? body.images[0] : body.image) || null
  if (image) {
    if (image.width) params._outputWidth = Number(image.width)
    if (image.height) params._outputHeight = Number(image.height)
  }
}

async function findGeneration(taskId) {
  const escaped = escapeFormula(taskId)
  const records = await listRecords(GENERATIONS, {
    filter: `OR({Source URL} = '${escaped}', FIND('${escaped}', {Params}) > 0)`,
    max: 1,
  })
  return records[0] || null
}

async function persistSuccess(taskId, urls, raw = {}, credits) {
  if (!Array.isArray(urls) || !urls.length) return { stored: false, credits: Number(credits || 0) }
  const record = await findGeneration(taskId)
  if (!record) return { stored: false, credits: Number(credits || 0) }

  const currentAttachment = Array.isArray(record.fields?.Media) ? record.fields.Media[0] : null
  const params = recordParams(record)
  const parsed = parseFalTaskId(taskId)
  addResultMetadata(params, raw)
  const inferred = inferFalCredits(params, raw)
  const finalCredits = Number(credits ?? inferred ?? params._credits ?? 0)
  params._credits = rounded(finalCredits)
  params._falStatus = 'COMPLETED'
  params._completedAt = new Date().toISOString()
  delete params._error

  if (!currentAttachment?.url) {
    const url = urls[0]
    const filename = `${String(params._model || parsed?.endpoint || 'fal-result').replace(/\W+/g, '-')}-${String(parsed?.requestId || '').slice(-8)}.${extFor(url)}`
    await updateRecord(GENERATIONS, record.id, {
      Name: `${params._model || parsed?.endpoint || 'fal.ai'} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      'Source URL': url,
      Params: JSON.stringify(params),
      Media: [{ url, filename }],
      Status: 'Ready',
    })
  } else {
    await updateRecord(GENERATIONS, record.id, {
      Params: JSON.stringify(params),
      Status: 'Ready',
    })
  }

  return { stored: true, credits: params._credits, raw }
}

async function persistFailure(taskId, error) {
  const record = await findGeneration(taskId)
  if (!record) return { stored: false }
  const params = recordParams(record)
  params._falStatus = 'FAILED'
  params._error = String(error || 'fal.ai generation failed.')
  params._completedAt = new Date().toISOString()
  await updateRecord(GENERATIONS, record.id, {
    Params: JSON.stringify(params),
    Status: 'Failed',
  })
  return { stored: true }
}

async function syncFalTask(taskId, key) {
  const parsed = parseFalTaskId(taskId)
  if (!parsed) throw new Error('Invalid fal task id')

  const record = await findGeneration(taskId)
  const params = recordParams(record)
  const alreadyStoredUrls = mediaUrls(record)
  if (alreadyStoredUrls.length && String(record?.fields?.Status || '').toLowerCase() === 'ready') {
    return {
      state: 'success',
      urls: alreadyStoredUrls,
      credits: Number(params._credits || 0),
      error: '',
      provider: 'fal',
      raw: {},
      stored: true,
    }
  }
  if (String(params._falStatus || '').toUpperCase() === 'FAILED') {
    return {
      state: 'fail',
      urls: [],
      credits: Number(params._credits || 0),
      error: params._error || 'fal.ai generation failed.',
      provider: 'fal',
      raw: {},
      stored: true,
    }
  }

  const queueState = await falStatus(
    parsed.endpoint,
    parsed.requestId,
    key,
    params._falStatusUrl,
    params._falResponseUrl,
  )
  const normalized = String(queueState.status || '').toUpperCase()

  if (normalized === 'COMPLETED') {
    const completed = queueState._inlineResult || await falResult(
      parsed.endpoint,
      parsed.requestId,
      key,
      params._falResponseUrl || queueState.response_url,
    )
    const urls = resultUrls(completed)
    if (!urls.length) {
      const error = 'fal.ai marked the request completed but returned no media URL.'
      await persistFailure(taskId, error)
      return { state: 'fail', urls: [], error, provider: 'fal', raw: completed }
    }
    const stored = await persistSuccess(taskId, urls, completed)
    return {
      state: 'success',
      urls,
      credits: stored.credits,
      error: '',
      provider: 'fal',
      raw: resultBody(completed),
      stored: stored.stored,
    }
  }

  if (normalized === 'FAILED' || normalized === 'ERROR') {
    const error = queueState.error || queueState.detail || 'fal.ai generation failed.'
    await persistFailure(taskId, error)
    return { state: 'fail', urls: [], error, provider: 'fal', raw: queueState }
  }

  return {
    state: normalized === 'IN_PROGRESS' ? 'processing' : 'waiting',
    urls: [],
    error: '',
    provider: 'fal',
    raw: queueState,
  }
}

module.exports = {
  parseFalTaskId,
  findGeneration,
  persistSuccess,
  persistFailure,
  syncFalTask,
}
