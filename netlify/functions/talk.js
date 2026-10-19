// Dialogue text -> talking video. kie.ai talking-avatar models require an audio
// URL, so this endpoint runs as a resumable two-stage flow:
//   1. create the voice task and return it immediately;
//   2. once the browser sees that audio is ready, call this endpoint again with
//      the voice task/audio URL to create the final talking-video task.
// This keeps the Netlify function short and avoids the previous hard-coded 504.
const { json, denied, byId, createTask, getTask, toHostedUrl, checkEnv, guard } = require('./_kie')
const { GENERATIONS, createRecord } = require('./_airtable')

// No kie.ai model has a motion parameter -- all 128 were checked. On five of
// six lip-sync models this can only steer the prompt. Wan is the exception:
// guidance_scale is real, and is set below when present.
const MOTION = [
  [0.2, 'The subject stays very still, with only minimal, subtle head movement.'],
  [0.4, 'The subject moves naturally but calmly, with restrained head motion.'],
  [0.6, 'The subject speaks with natural head movement and light gestures.'],
  [0.8, 'The subject is animated and expressive, with clear head movement and gestures.'],
  [1.1, 'The subject is highly energetic and expressive, with bold gestures and lively motion.'],
]
const motionPrompt = (a) => (MOTION.find(([t]) => a < t) || MOTION[MOTION.length - 1])[1]

const failedState = (state) => ['fail', 'failed', 'error'].includes(String(state || '').toLowerCase())

exports.handler = guard('talk', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })
  const gate = denied(event); if (gate) return gate

  // Generation requires Kie only. Airtable is permanent storage and must not
  // block a valid talking-video task, matching the image/video create endpoint.
  const env = checkEnv({ airtable: false }); if (env) return env

  const b = JSON.parse(event.body || '{}')
  const { text, portrait, voice, modelId = 'kling/ai-avatar-standard' } = b
  const emotion = Number(b.emotion ?? 0)
  const motion = Number(b.motion ?? 0.5)
  if (!text) return json(400, { error: 'Dialogue text is required.' })
  if (!portrait) return json(400, { error: 'Select a portrait.' })
  if (!voice) return json(400, { error: 'This avatar has no voice assigned.' })

  const model = byId(modelId)
  if (!model || model.kind !== 'talk') return json(400, { error: `Not a talking-avatar model: ${modelId}` })

  const ttsModel = b.ttsModel || 'elevenlabs/text-to-speech-multilingual-v2'
  const ttsInput = {
    text,
    voice,
    stability: 0.5,
    similarity_boost: 0.75,
    style: emotion,
    speed: Number(b.speed ?? 1),
  }

  let ttsId = b.ttsId || ''
  let audio = b.audio || ''

  // First request: only enqueue ElevenLabs. Do not hold the serverless request
  // open while Kie generates audio.
  if (!ttsId && !audio) {
    ttsId = await createTask(ttsModel, ttsInput)
    return json(202, {
      ok: true,
      pending: true,
      phase: 'voice',
      taskId: ttsId,
      ttsId,
      kind: 'talk',
      model: modelId,
      prompt: text,
      params: {},
      storage: 'direct',
    })
  }

  // Resume request without a supplied audio URL: check the existing voice task
  // exactly once and return 202 while it is still running.
  if (!audio) {
    const voiceTask = await getTask(ttsId)
    if (failedState(voiceTask.state)) {
      return json(502, { error: `Voice generation failed: ${voiceTask.error || 'Unknown error'}`, ttsId })
    }
    if (String(voiceTask.state || '').toLowerCase() !== 'success' || !voiceTask.urls.length) {
      return json(202, {
        ok: true,
        pending: true,
        phase: 'voice',
        taskId: ttsId,
        ttsId,
        kind: 'talk',
        model: modelId,
        prompt: text,
        params: {},
        storage: 'direct',
      })
    }
    audio = voiceTask.urls[0]
  }

  // Step 2 -- portrait + completed audio -> video, on a callback.
  const portraitUrl = await toHostedUrl(portrait, 0)
  const input = {
    [model.portrait]: portraitUrl,
    [model.audio]: audio,
    prompt: b.prompt || motionPrompt(motion),
  }
  if (b.resolution && model.resolutionField) input[model.resolutionField] = b.resolution
  if (model.guidance) {
    const [lo, hi] = model.guidance
    input.guidance_scale = Math.round((lo + (hi - lo) * motion) * 100) / 100
  }

  const base = process.env.URL || process.env.DEPLOY_PRIME_URL
  const cb = base ? `${base}/.netlify/functions/callback` : undefined
  const taskId = await createTask(modelId, input, cb)

  const meta = {
    ...input,
    _model: modelId,
    _kind: 'talk',
    _prompt: text,
    _taskId: taskId,
    _tts: { taskId: ttsId || null, model: ttsModel, ...ttsInput },
  }
  delete meta.prompt

  let storage = 'airtable'
  let storageWarning = ''
  try {
    await createRecord(GENERATIONS, {
      Name: `${modelId} · queued`,
      Type: 'Video',
      Model: modelId,
      Prompt: text,
      'Source URL': taskId,
      Params: JSON.stringify(meta),
      Status: 'Draft',
      Created: new Date().toISOString(),
    })
  } catch (error) {
    storage = 'direct'
    storageWarning = `Airtable storage unavailable: ${error.message}`
    console.error('[talk] task created but Airtable queue write failed', taskId, error)
  }

  return json(200, {
    ok: true,
    pending: false,
    phase: 'video',
    taskId,
    ttsId: ttsId || null,
    audio,
    kind: 'talk',
    model: modelId,
    prompt: text,
    params: input,
    storage,
    storageWarning,
  })
})