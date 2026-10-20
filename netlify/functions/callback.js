// Kie.ai posts here when a generation finishes. The callback resolves the
// queued Airtable row first so it can use that account's own Kie key and store
// the exact provider-reported creditsConsumed value.
const { json, getTask, guard } = require('./_kie')
const { GENERATIONS, updateRecord, listRecords } = require('./_airtable')
const { getAccount, accountProviderKeys } = require('./_auth')

const extFor = (kind, url) => {
  const match = /\.(mp4|mov|webm|png|jpe?g|webp)(?:\?|$)/i.exec(url || '')
  if (match) return match[1].toLowerCase().replace('jpeg', 'jpg')
  return kind === 'video' ? 'mp4' : 'jpg'
}

exports.handler = guard('callback', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  const body = JSON.parse(event.body || '{}')
  const taskId = body.data?.taskId || body.taskId
  if (!taskId) return json(400, { error: 'No taskId in callback' })

  const pending = await listRecords(GENERATIONS, {
    filter: `OR({Source URL} = '${String(taskId).replace(/'/g, "\\'")}', FIND('${String(taskId).replace(/'/g, "\\'")}', {Params}) > 0)`,
    max: 1,
  })
  if (!pending[0]) return json(200, { ok: true, stored: false, ignored: 'no matching queued row' })

  let params = {}
  try { params = JSON.parse(pending[0].fields.Params || '{}') } catch {}

  let key = ''
  if (params._accountId) {
    const account = await getAccount(params._accountId)
    key = accountProviderKeys(account).kie
  }
  if (!key) {
    return json(200, {
      ok: true,
      stored: false,
      ignored: 'matching account Kie key unavailable; Library reconciliation will retry',
    })
  }

  const task = await getTask(taskId, key)
  if (task.state !== 'success' || !task.urls.length) {
    return json(200, { ok: true, ignored: `state=${task.state}` })
  }

  try {
    const url = task.urls[0]
    const kind = params._kind || 'image'
    const credits = Number(task.credits)
    params._provider = 'kie'
    if (Number.isFinite(credits) && credits > 0) params._credits = credits
    params._completedAt = new Date().toISOString()
    delete params._error
    const filename = `${(params._model || 'result').replace(/\W+/g, '-')}-${taskId.slice(-8)}.${extFor(kind, url)}`

    await updateRecord(GENERATIONS, pending[0].id, {
      Name: `${params._model || 'kie'} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      'Source URL': url,
      Params: JSON.stringify(params),
      Media: [{ url, filename }],
      Status: 'Ready',
    })
    return json(200, { ok: true, stored: true, credits: params._credits || null })
  } catch (error) {
    console.error('[callback] result completed but Airtable storage failed', taskId, error)
    return json(200, {
      ok: true,
      stored: false,
      storageWarning: error.message,
      urls: task.urls,
      credits: task.credits,
    })
  }
})
