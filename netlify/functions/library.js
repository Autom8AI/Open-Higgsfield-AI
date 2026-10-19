// The permanent library is read from Airtable. Pending provider records are also
// reconciled here so completed media and exact consumed credits are recovered
// even when the browser that queued a task was closed.
const { json, denied, guard, getTask } = require('./_kie')
const { GENERATIONS, listRecords, deleteRecord, updateRecord } = require('./_airtable')
const { requireAccount, accountProviderKeys } = require('./_auth')
const { syncFalTask } = require('./_fal-generation')

function recordParams(record) {
  try { return JSON.parse(record?.fields?.Params || '{}') } catch { return {} }
}

function providerFor(params) {
  const explicit = String(params._provider || '').toLowerCase()
  if (explicit === 'fal' || explicit === 'kie') return explicit
  return String(params._taskId || '').startsWith('fal:') ? 'fal' : 'kie'
}

function mediaExtension(kind, url) {
  const match = /\.(mp4|mov|webm|m4v|gif|png|jpe?g|webp|avif)(?:\?|$)/i.exec(String(url || ''))
  if (match) return match[1].toLowerCase().replace('jpeg', 'jpg')
  return kind === 'video' ? 'mp4' : 'png'
}

async function syncKieRecord(record, params, key) {
  const taskId = String(params._taskId || '')
  if (!taskId || taskId.startsWith('fal:')) return false

  const task = await getTask(taskId, key)
  const state = String(task.state || '').toLowerCase()
  if (state === 'fail' || state === 'failed' || state === 'error') {
    params._provider = 'kie'
    params._error = task.error || 'Kie.ai generation failed.'
    params._completedAt = new Date().toISOString()
    await updateRecord(GENERATIONS, record.id, {
      Params: JSON.stringify(params),
      Status: 'Failed',
    })
    return true
  }

  if (state !== 'success' || !Array.isArray(task.urls) || !task.urls.length) return false

  const url = task.urls[0]
  const kind = String(params._kind || record.fields?.Type || '').toLowerCase() === 'video' ? 'video' : 'image'
  const credits = Number(task.credits)
  params._provider = 'kie'
  if (Number.isFinite(credits) && credits > 0) params._credits = credits
  params._completedAt = new Date().toISOString()
  delete params._error

  const fields = {
    Name: `${params._model || record.fields?.Model || 'kie'} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    'Source URL': url,
    Params: JSON.stringify(params),
    Status: 'Ready',
  }
  const hasMedia = Array.isArray(record.fields?.Media) && record.fields.Media.length
  if (!hasMedia) {
    fields.Media = [{
      url,
      filename: `${String(params._model || record.fields?.Model || 'kie-result').replace(/\W+/g, '-')}-${taskId.slice(-8)}.${mediaExtension(kind, url)}`,
    }]
  }
  await updateRecord(GENERATIONS, record.id, fields)
  return true
}

exports.handler = guard('library', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  const gate = denied(event); if (gate) return gate

  if (event.httpMethod === 'DELETE') {
    const id = (event.queryStringParameters || {}).id
    if (!id) return json(400, { error: 'id required' })
    try {
      await deleteRecord(GENERATIONS, id)
      return json(200, { ok: true })
    } catch (error) {
      return json(503, { error: `Permanent library storage is unavailable: ${error.message}` })
    }
  }

  let records = []
  try {
    records = await listRecords(GENERATIONS, { sortField: 'Created', max: 100 })
  } catch (error) {
    return json(200, {
      ok: true,
      items: [],
      storage: 'direct',
      storageWarning: `Airtable library unavailable: ${error.message}`,
    })
  }

  const auth = await requireAccount(event, { requireProviderSetup: false })
  if (!auth.error) {
    const keys = accountProviderKeys(auth.account)
    const parsedRecords = records.map((record) => ({ record, params: recordParams(record) }))

    const falTaskIds = parsedRecords
      .filter(({ record, params }) => {
        const hasMedia = Array.isArray(record.fields?.Media) && record.fields.Media.length
        return !hasMedia
          && String(params._taskId || '').startsWith('fal:')
          && (!params._accountId || params._accountId === auth.account.id)
          && !['FAILED', 'COMPLETED'].includes(String(params._falStatus || '').toUpperCase())
      })
      .map(({ params }) => params._taskId)
      .slice(0, 12)

    const kieRecords = parsedRecords
      .filter(({ record, params }) => {
        const taskId = String(params._taskId || '')
        const hasMedia = Array.isArray(record.fields?.Media) && record.fields.Media.length
        const credits = Number(params._credits || 0)
        return taskId
          && !taskId.startsWith('fal:')
          && (!params._accountId || params._accountId === auth.account.id)
          && (!hasMedia || credits <= 0)
          && String(record.fields?.Status || '').toLowerCase() !== 'failed'
      })
      .slice(0, 12)

    const work = []
    if (keys.fal) work.push(...falTaskIds.map((taskId) => syncFalTask(taskId, keys.fal)))
    if (keys.kie) work.push(...kieRecords.map(({ record, params }) => syncKieRecord(record, params, keys.kie)))

    if (work.length) {
      await Promise.allSettled(work)
      try { records = await listRecords(GENERATIONS, { sortField: 'Created', max: 100 }) } catch {}
    }
  }

  const items = records.map((record) => {
    const fields = record.fields || {}
    const attachment = Array.isArray(fields.Media) ? fields.Media[0] : null
    const params = recordParams(record)
    const falState = String(params._falStatus || '').toUpperCase()
    const state = falState === 'COMPLETED'
      ? 'success'
      : (falState === 'FAILED' ? 'failed' : String(fields.Status || '').toLowerCase())
    const provider = providerFor(params)
    const creditValue = Number(params._credits)
    const hasCredits = Number.isFinite(creditValue) && creditValue > 0
    const ready = Boolean(attachment?.url) || ['ready', 'success', 'completed'].includes(state)
    const duration = Number(params.duration || params._duration || 0) || null

    return {
      id: record.id,
      kind: (fields.Type || 'Image').toLowerCase() === 'video' ? 'videos' : 'images',
      model: fields.Model || '',
      prompt: fields.Prompt || '',
      status: fields.Status || '',
      state,
      error: params._error || '',
      url: attachment?.url || null,
      thumb: attachment?.thumbnails?.large?.url || attachment?.url || null,
      sourceUrl: /^https?:\/\//i.test(String(fields['Source URL'] || '')) ? fields['Source URL'] : '',
      mime: attachment?.type || '',
      provider,
      credits: hasCredits ? creditValue : null,
      creditStatus: hasCredits ? (ready ? 'actual' : 'estimated') : 'unknown',
      costUsd: provider === 'fal' && hasCredits ? Math.round((creditValue / 100) * 1000) / 1000 : null,
      duration,
      aspect: params.aspect_ratio || '',
      resolution: params.resolution || params.output_resolution || '',
      taskId: params._taskId || '',
      createdAt: fields.Created || record.createdTime,
    }
  })

  return json(200, { ok: true, items, storage: 'airtable' })
})
