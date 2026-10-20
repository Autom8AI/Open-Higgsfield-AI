// Dedicated portrait-to-video endpoint for the AI Influencer > Video workflow.
// It accepts one selected portrait and translates the shared UI fields into the
// exact input shape expected by each supported Kie model.
const { json, createTask, toHostedUrl, guard } = require('./_kie')
const { requireAccount, accountProviderKeys } = require('./_auth')
const { GENERATIONS, createRecord } = require('./_airtable')

const MODEL_SPECS = {
  'bytedance/seedance-2': {
    label: 'Seedance 2.0',
    imageField: 'reference_image_urls',
    aspects: ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9', 'adaptive'],
    resolutions: ['480p', '720p', '1080p', '4k'],
    defaultResolution: '720p',
    audioField: 'generate_audio',
  },
  'bytedance/seedance-2-fast': {
    label: 'Seedance 2.0 Fast',
    imageField: 'reference_image_urls',
    aspects: ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9', 'adaptive'],
    resolutions: ['480p', '720p'],
    defaultResolution: '720p',
    audioField: 'generate_audio',
  },
  'bytedance/seedance-1.5-pro': {
    label: 'Seedance 1.5 Pro',
    imageField: 'input_urls',
    aspects: ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'],
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    audioField: 'generate_audio',
  },
  'kling-3.0/video': {
    label: 'Kling 3.0',
    imageField: 'image_urls',
    aspects: ['16:9', '9:16', '1:1'],
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    kling: true,
  },
  'happyhorse/reference-to-video': {
    label: 'HappyHorse Reference to Video',
    imageField: 'reference_image',
    aspects: ['16:9', '9:16', '3:4', '4:3', '4:5', '5:4', '1:1', '9:21', '21:9'],
    resolutions: ['720p', '1080p'],
    defaultResolution: '1080p',
  },
}

function clampDuration(value) {
  const duration = Math.round(Number(value) || 5)
  return Math.min(15, Math.max(4, duration))
}

function cleanPrompt(value) {
  return String(value || '').trim()
}

async function storeQueued({ taskId, modelId, prompt, input, accountId }) {
  try {
    await createRecord(GENERATIONS, {
      Name: `${modelId} · queued`,
      Type: 'Video',
      Model: modelId,
      Prompt: prompt,
      'Source URL': taskId,
      Params: JSON.stringify({
        ...input,
        _model: modelId,
        _kind: 'video',
        _prompt: prompt,
        _taskId: taskId,
        _credits: 0,
        _accountId: accountId,
        _avatarVideo: true,
      }),
      Status: 'Draft',
      Created: new Date().toISOString(),
    })
    return { storage: 'airtable', storageWarning: '' }
  } catch (error) {
    console.error('[avatar-video] task created but Airtable queue write failed', taskId, error)
    return { storage: 'direct', storageWarning: `Airtable storage unavailable: ${error.message}` }
  }
}

exports.handler = guard('avatar-video', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const auth = await requireAccount(event)
  if (auth.error) return json(auth.error.statusCode, auth.error.body)
  const keys = accountProviderKeys(auth.account)
  if (!keys.kie) return json(403, { error: 'KIE_KEY_REQUIRED' })

  const body = JSON.parse(event.body || '{}')
  const modelId = String(body.modelId || '')
  const spec = MODEL_SPECS[modelId]
  if (!spec) {
    return json(400, {
      error: 'Select an avatar-video model that supports portrait references.',
      detail: `Unsupported model: ${modelId || 'none'}`,
    })
  }

  const prompt = cleanPrompt(body.prompt)
  if (!prompt) return json(400, { error: 'Video prompt is required.' })

  const portrait = String(body.portrait || '')
  if (!portrait) return json(400, { error: 'Select a portrait before generating the video.' })

  const params = body.params || {}
  const duration = clampDuration(params.duration)
  const aspect = spec.aspects.includes(params.aspect_ratio) ? params.aspect_ratio : (spec.aspects.includes('9:16') ? '9:16' : spec.aspects[0])
  const resolution = spec.resolutions.includes(params.resolution) ? params.resolution : spec.defaultResolution
  const portraitUrl = await toHostedUrl(portrait, 0, keys.kie)

  let input
  if (spec.kling) {
    input = {
      prompt,
      [spec.imageField]: [portraitUrl],
      sound: Boolean(params.generate_audio),
      duration: String(duration),
      aspect_ratio: aspect,
      mode: resolution === '1080p' ? 'pro' : 'std',
      multi_shots: false,
    }
  } else {
    input = {
      prompt,
      [spec.imageField]: [portraitUrl],
      aspect_ratio: aspect,
      resolution,
      duration,
    }
    if (spec.audioField) input[spec.audioField] = Boolean(params.generate_audio)
  }

  const base = process.env.URL || process.env.DEPLOY_PRIME_URL
  const callbackUrl = base ? `${base}/.netlify/functions/callback` : undefined

  let taskId
  try {
    taskId = await createTask(modelId, input, callbackUrl, keys.kie)
  } catch (error) {
    console.error('[avatar-video] provider rejected task', modelId, error)
    return json(502, {
      error: `${spec.label} could not start the avatar video.`,
      detail: error.message,
    })
  }

  const stored = await storeQueued({
    taskId,
    modelId,
    prompt,
    input,
    accountId: auth.account.id,
  })

  return json(200, {
    ok: true,
    taskId,
    kind: 'video',
    model: modelId,
    prompt,
    params: input,
    provider: 'kie',
    ...stored,
  })
})
