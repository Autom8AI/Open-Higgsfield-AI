// Poll a task from either Kie.ai or fal.ai with the signed-in account's key.
// Completed fal output is also persisted to Airtable by syncFalTask.
const { json, denied, getTask, guard } = require('./_kie')
const { requireAccount, accountProviderKeys } = require('./_auth')
const { syncFalTask } = require('./_fal-generation')

exports.handler = guard('status', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  const gate = denied(event); if (gate) return gate
  const taskId = (event.queryStringParameters || {}).taskId
  if (!taskId) return json(400, { error: 'taskId required' })

  const auth = await requireAccount(event)
  if (auth.error) return json(auth.error.statusCode, auth.error.body)
  const keys = accountProviderKeys(auth.account)

  if (taskId.startsWith('fal:')) {
    if (!keys.fal) return json(403, { error: 'FAL_KEY_REQUIRED' })
    const result = await syncFalTask(taskId, keys.fal)
    return json(200, { ok: true, ...result })
  }

  if (!keys.kie) return json(403, { error: 'KIE_KEY_REQUIRED' })
  const task = await getTask(taskId, keys.kie)
  return json(200, {
    ok: true,
    state: task.state,
    urls: task.urls,
    credits: task.credits,
    error: task.error,
    provider: 'kie',
  })
})
