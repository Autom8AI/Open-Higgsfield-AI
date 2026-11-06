// Save (POST { key }) or remove (DELETE) the account's own ElevenLabs key.
// The key is checked against ElevenLabs before it is stored.
const { json, guard } = require('./_kie')
const { requireAccount, updateAccount } = require('./_auth')
const { validateKey, listMyVoices } = require('./_eleven')

exports.handler = guard('voice-key', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  const auth = await requireAccount(event, { requireProviderSetup: false })
  if (auth.error) return json(auth.error.statusCode, auth.error.body)

  if (event.httpMethod === 'DELETE') {
    await updateAccount(auth.account.id, { 'ElevenLabs API Key': null })
    return json(200, { ok: true })
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const key = String(JSON.parse(event.body || '{}').key || '').trim()
  if (!key) return json(400, { error: 'Paste your ElevenLabs API key.' })
  if (!(await validateKey(key))) return json(400, { error: 'ElevenLabs did not accept that key. It needs the Voices permission.' })
  await updateAccount(auth.account.id, { 'ElevenLabs API Key': key })
  const mine = await listMyVoices(key).catch(() => [])
  return json(200, { ok: true, mine })
})
