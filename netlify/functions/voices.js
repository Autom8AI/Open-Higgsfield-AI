// The 67 ElevenLabs presets, each with the preview mp3 kie.ai hosts.
//
// voices.json lives in data/, not here: Netlify reads any <function>.json in
// the functions directory as that function's config manifest, and a data array
// fails the deploy with "cannot unmarshal array into functionManifest".
const VOICES = require('../../data/voices.json')
const { json, denied, checkEnv, guard } = require('./_kie')

exports.handler = guard('voices', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  const gate = denied(event); if (gate) return gate
  const env = checkEnv({ airtable: false }); if (env) return env
  return json(200, { ok: true, voices: VOICES.map((v) => ({
    ...v, preview: `https://static.aiquickdraw.com/elevenlabs/voice/${v.id}.mp3`,
  })) })
})
