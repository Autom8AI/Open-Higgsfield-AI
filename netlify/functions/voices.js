// Voices for the Voice step: the 67 ElevenLabs presets (kie.ai hosts their
// previews) plus, when the account has saved its own ElevenLabs key, that
// account's cloned voices.
//
// voices.json lives in data/, not here: Netlify reads any <function>.json in
// the functions directory as that function's config manifest, and a data array
// fails the deploy with "cannot unmarshal array into functionManifest".
const VOICES = require('../../data/voices.json')
const { json, denied, checkEnv, guard } = require('./_kie')
const { requireAccount, accountProviderKeys } = require('./_auth')
const { listMyVoices } = require('./_eleven')

exports.handler = guard('voices', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  const gate = denied(event); if (gate) return gate
  const env = checkEnv({ airtable: false }); if (env) return env
  const voices = VOICES.map((v) => ({ ...v, preview: `https://static.aiquickdraw.com/elevenlabs/voice/${v.id}.mp3` }))

  let mine = []
  let hasElevenKey = false
  let mineError = ''
  const auth = await requireAccount(event, { requireProviderSetup: false })
  if (!auth.error) {
    const key = accountProviderKeys(auth.account).eleven
    hasElevenKey = Boolean(key)
    if (key) {
      try { mine = await listMyVoices(key) } catch (e) { mineError = e.message }
    }
  }
  return json(200, { ok: true, voices, mine, hasElevenKey, mineError })
})
