// Make the voiceover audio for a video.
//   POST { text, voiceId, source: 'preset' | 'mine' }
//   - preset: kie.ai ElevenLabs task (billed in kie credits) -> { taskId }; poll /status
//   - mine:   the account's own ElevenLabs key (billed on that ElevenLabs plan) -> { url }
const { json, guard, createTask, uploadBase64 } = require('./_kie')
const { requireAccount, accountProviderKeys } = require('./_auth')
const { speak } = require('./_eleven')
const VOICES = require('../../data/voices.json')

const TTS_MODEL = 'elevenlabs/text-to-speech-multilingual-v2'

exports.handler = guard('voiceover', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })
  const auth = await requireAccount(event)
  if (auth.error) return json(auth.error.statusCode, auth.error.body)
  const keys = accountProviderKeys(auth.account)

  const b = JSON.parse(event.body || '{}')
  const text = String(b.text || '').trim()
  const voiceId = String(b.voiceId || '')
  if (!text) return json(400, { error: 'Write the voiceover script.' })
  if (text.length > 1000) return json(400, { error: 'Voiceover script is too long (1000 characters max).' })
  if (!voiceId) return json(400, { error: 'Pick a voice.' })

  if (b.source === 'mine') {
    if (!keys.eleven) return json(403, { error: 'ELEVEN_KEY_REQUIRED' })
    if (!keys.kie) return json(403, { error: 'KIE_KEY_REQUIRED' })
    const dataUrl = await speak(keys.eleven, voiceId, text, b.settings)
    const url = await uploadBase64(dataUrl, `voiceover-${Date.now()}.mp3`, keys.kie)
    return json(200, { ok: true, url, provider: 'elevenlabs', chars: text.length })
  }

  if (!VOICES.some((v) => v.id === voiceId)) return json(400, { error: 'Unknown preset voice.' })
  if (!keys.kie) return json(403, { error: 'KIE_KEY_REQUIRED' })
  const s = b.settings || {}
  const taskId = await createTask(TTS_MODEL, {
    text, voice: voiceId,
    stability: s.stability ?? 0.5, similarity_boost: s.similarity_boost ?? 0.75, style: s.style ?? 0, speed: s.speed ?? 1,
  }, undefined, keys.kie)
  return json(200, { ok: true, taskId, provider: 'kie', chars: text.length })
})
