// Direct ElevenLabs API, used with an account's own key for its cloned voices.
const API = 'https://api.elevenlabs.io/v1'

async function elevenFetch(path, key, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'xi-api-key': key, ...(options.headers || {}) },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const error = new Error(`ElevenLabs ${res.status}: ${text.slice(0, 200)}`)
    error.status = res.status
    throw error
  }
  return res
}

// The account's own voices (cloned, generated, professional), not the presets.
async function listMyVoices(key) {
  const res = await elevenFetch('/voices', key)
  const data = await res.json()
  return (data.voices || [])
    .filter((v) => v.category && v.category !== 'premade')
    .map((v) => ({ id: v.voice_id, name: v.name, desc: v.category, preview: v.preview_url || '' }))
}

async function validateKey(key) {
  try { await elevenFetch('/voices', key); return true } catch (e) { if (e.status === 401 || e.status === 403) return false; throw e }
}

// Returns mp3 bytes as a data URL.
async function speak(key, voiceId, text, settings = {}) {
  const res = await elevenFetch(`/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: settings.stability ?? 0.5, similarity_boost: settings.similarity_boost ?? 0.75, style: settings.style ?? 0, speed: settings.speed ?? 1 },
    }),
  })
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:audio/mpeg;base64,${buf.toString('base64')}`
}

module.exports = { listMyVoices, validateKey, speak }
