const { json, guard } = require('./_kie')
const { requireAccount, updateAccount } = require('./_auth')

async function validateKie(key) {
  if (!key) return true
  const response = await fetch('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=validation', {
    headers: { Authorization: `Bearer ${key}` },
  })
  return response.status !== 401 && response.status !== 403
}

async function validateFal(key) {
  if (!key) return true
  const response = await fetch('https://queue.fal.run/fal-ai/flux-pro/kontext', {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: '' }),
  })
  return response.status !== 401 && response.status !== 403
}

exports.handler = guard('provider-setup', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const auth = await requireAccount(event, { requireProviderSetup: false })
  if (auth.error) return json(auth.error.statusCode, auth.error.body)

  const body = JSON.parse(event.body || '{}')
  const kieKey = String(body.kieKey || '').trim()
  const falKey = String(body.falKey || '').trim()
  if (!kieKey && !falKey) return json(400, { error: 'Connect at least one provider to continue.' })

  const [kieValid, falValid] = await Promise.all([validateKie(kieKey), validateFal(falKey)])
  if (!kieValid || !falValid) {
    return json(400, {
      error: 'One or more API keys could not be validated.',
      fields: { kieKey: kieValid ? null : 'Invalid Kie.ai API key.', falKey: falValid ? null : 'Invalid fal.ai API key.' },
    })
  }

  await updateAccount(auth.account.id, {
    'Provider Setup Complete': true,
    'Has Kie': Boolean(kieKey),
    'Has fal': Boolean(falKey),
    'Kie API Key': kieKey || null,
    'fal API Key': falKey || null,
  })

  return json(200, { ok: true, hasKie: Boolean(kieKey), hasFal: Boolean(falKey) })
})
