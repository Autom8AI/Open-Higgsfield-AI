const { json, byId, createTask, toHostedUrl, guard } = require('./_kie')
const { submit: falSubmit } = require('./_fal')
const { GENERATIONS, createRecord } = require('./_airtable')
const { requireAccount, accountProviderKeys, updateAccount } = require('./_auth')

const STYLES = {
  realistic: { prompt: 'Photorealistic, natural lighting, true-to-life detail and texture.', enum: 'REALISTIC' },
  cartoon: { prompt: 'Bold cartoon illustration, clean linework, flat vibrant colour.', enum: 'GENERAL' },
  abstract: { prompt: 'Abstract art, non-literal shapes, expressive colour and composition.', enum: 'DESIGN' },
}

const FAL_KONTEXT = 'fal-ai/flux-pro/kontext'
const FAL_LORA = 'fal-ai/flux-lora'
const FAL_HAPPY_HORSE_VIDEO_EDIT = 'alibaba/happy-horse/video-edit'
const FAL_MODELS = {
  [FAL_KONTEXT]: {
    id: FAL_KONTEXT, label: 'FLUX Kontext Pro', kind: 'image', api: 'fal',
    images: { max: 1, required: true }, aspects: ['1:1', '4:5', '3:4', '16:9', '9:16'], credits: 4,
  },
  [FAL_LORA]: {
    id: FAL_LORA, label: 'FLUX LoRA Realistic', kind: 'image', api: 'fal',
    aspects: ['1:1', '4:5', '3:4', '16:9', '9:16'], credits: 3,
  },
}

const VIDEO_EDIT_MODEL = {
  id: FAL_HAPPY_HORSE_VIDEO_EDIT,
  label: 'Happy Horse Video Edit',
  kind: 'video',
  api: 'fal',
  credits: 0,
}

const HAPPYHORSE_REFERENCE_ID = 'happyhorse-1-1/reference-to-video'
const HAPPYHORSE_REFERENCE_IMAGES = { param: 'reference_image', max: 5, required: true }
const CAR_INTERIOR_PREFIX = 'Use the three supplied interior images as sequential keyframes for the animation.'
const CAR_INTERIOR_SEEDANCE = 'bytedance/seedance-2'
const CAR_INTERIOR_KLING = 'kling-3.0/video'
const CAR_INTERIOR_MODELS = [CAR_INTERIOR_SEEDANCE, CAR_INTERIOR_KLING]
const GPT_IMAGE_EDIT = 'gpt-image-2-image-to-image'
const NANO_BANANA_EDIT = 'google/nano-banana-edit'

function falImageSize(aspect) {
  return ({
    '1:1': 'square_hd',
    '4:5': { width: 1024, height: 1280 },
    '3:4': 'portrait_4_3',
    '9:16': 'portrait_16_9',
    '16:9': 'landscape_16_9',
  })[aspect] || 'square_hd'
}

function falKontextAspect(aspect) {
  const mapped = ({ '4:5': '3:4', '5:4': '4:3' })[aspect] || aspect
  const supported = ['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21']
  return supported.includes(mapped) ? mapped : '3:4'
}

function isPublicUrl(value) {
  return /^https?:\/\//i.test(String(value || ''))
}

async function storeQueued({ model, prompt, taskId, input, credits, accountId }) {
  try {
    await createRecord(GENERATIONS, {
      Name: `${model.id} · queued`,
      Type: model.kind === 'video' || model.kind === 'talk' ? 'Video' : 'Image',
      Model: model.id,
      Prompt: prompt,
      'Source URL': taskId,
      Params: JSON.stringify({ ...input, _model: model.id, _kind: model.kind, _prompt: prompt, _taskId: taskId, _credits: credits || 0, _accountId: accountId }),
      Status: 'Draft',
      Created: new Date().toISOString(),
    })
    return { storage: 'airtable', storageWarning: '' }
  } catch (error) {
    console.error('[create] task created but Airtable queue write failed', taskId, error)
    return { storage: 'direct', storageWarning: `Airtable storage unavailable: ${error.message}` }
  }
}

async function trackUsage(account, provider, credits = 0) {
  try {
    const requestField = provider === 'fal' ? 'fal Requests' : 'Kie Requests'
    await updateAccount(account.id, {
      [requestField]: Number(account.fields[requestField] || 0) + 1,
      'Estimated Credits Used': Number(account.fields['Estimated Credits Used'] || 0) + Number(credits || 0),
      'Last API Use': new Date().toISOString(),
    })
  } catch (error) {
    console.error('[create] usage tracking failed', account.id, error.message)
  }
}

async function submitFalGeneration({ model, input, prompt, key, account }) {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL
  const webhookUrl = base
    ? `${base}/.netlify/functions/fal-callback?endpoint=${encodeURIComponent(model.id)}`
    : undefined
  const submission = await falSubmit(model.id, input, webhookUrl, key)
  const requestId = submission.requestId
  const taskId = `fal:${encodeURIComponent(model.id)}:${requestId}`
  const trackedInput = {
    ...input,
    _falStatusUrl: submission.statusUrl,
    _falResponseUrl: submission.responseUrl,
    _falCancelUrl: submission.cancelUrl,
  }
  const stored = await storeQueued({
    model,
    prompt,
    taskId,
    input: trackedInput,
    credits: model.credits,
    accountId: account.id,
  })
  await trackUsage(account, 'fal', model.credits)
  return { taskId, trackedInput, stored }
}

exports.handler = guard('create', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const auth = await requireAccount(event)
  if (auth.error) return json(auth.error.statusCode, auth.error.body)
  const keys = accountProviderKeys(auth.account)

  const body = JSON.parse(event.body || '{}')
  let {
    modelId, prompt, images = [], videos = [], params = {}, style, brand = false,
    avatarLoraUrl, avatarTriggerWord,
  } = body
  if (!prompt) return json(400, { error: 'Prompt is required.' })

  if (modelId === VIDEO_EDIT_MODEL.id) {
    if (!keys.fal) return json(403, { error: 'FAL_KEY_REQUIRED' })
    if (videos.length !== 1 || !isPublicUrl(videos[0])) {
      return json(400, { error: 'Happy Horse Video Edit requires one fal-hosted or public source-video URL.' })
    }
    if (images.length < 1 || images.length > 5 || images.some(image => !isPublicUrl(image))) {
      return json(400, { error: 'Happy Horse Video Edit requires 1–5 fal-hosted or public reference-image URLs.' })
    }
    if (String(prompt).length > 2500) return json(400, { error: 'Happy Horse Video Edit prompts cannot exceed 2,500 characters.' })

    const resolution = params.resolution === '720p' ? '720p' : '1080p'
    const audioSetting = params.audio_setting === 'origin' ? 'origin' : 'auto'
    const seed = Number(params.seed)
    const input = {
      video_url: videos[0],
      prompt,
      reference_image_urls: images,
      resolution,
      audio_setting: audioSetting,
      enable_safety_checker: true,
    }
    if (Number.isInteger(seed) && seed >= 0 && seed <= 2147483647) input.seed = seed

    const submitted = await submitFalGeneration({
      model: VIDEO_EDIT_MODEL,
      input,
      prompt,
      key: keys.fal,
      account: auth.account,
    })
    return json(200, {
      ok: true,
      taskId: submitted.taskId,
      kind: 'video',
      model: VIDEO_EDIT_MODEL.id,
      prompt,
      params: submitted.trackedInput,
      provider: 'fal',
      ...submitted.stored,
    })
  }

  const falModel = FAL_MODELS[modelId]
  if (falModel) {
    if (!keys.fal) return json(403, { error: 'FAL_KEY_REQUIRED' })
    if (falModel.images?.required && !images.length) return json(400, { error: `${falModel.label} requires one reference image.` })
    if (images.length > (falModel.images?.max || 0)) return json(400, { error: `${falModel.label} accepts at most ${falModel.images.max} image.` })
    if (params.aspect_ratio && !falModel.aspects.includes(params.aspect_ratio)) return json(400, { error: `${falModel.label} does not support ${params.aspect_ratio}.` })

    const chosen = STYLES[style]
    if (chosen) prompt = `${prompt.replace(/[.\s]+$/, '')}. ${chosen.prompt}`

    let input
    if (modelId === FAL_KONTEXT) {
      const reference = String(images[0] || '')
      if (!/^data:image\//i.test(reference) && !isPublicUrl(reference)) {
        return json(400, { error: 'FLUX Kontext requires a valid image upload or public image URL.' })
      }
      input = {
        prompt,
        image_url: reference,
        aspect_ratio: falKontextAspect(params.aspect_ratio),
        guidance_scale: 3.5,
        num_images: 1,
        output_format: params.output_format === 'jpeg' ? 'jpeg' : 'png',
        safety_tolerance: '2',
        enhance_prompt: false,
      }
    } else {
      input = {
        prompt,
        image_size: falImageSize(params.aspect_ratio),
        num_images: 1,
        output_format: params.output_format || 'png',
      }
    }

    if (modelId === FAL_LORA && avatarLoraUrl) {
      input.loras = [{ path: avatarLoraUrl, scale: 1 }]
      if (avatarTriggerWord && !prompt.toLowerCase().includes(String(avatarTriggerWord).toLowerCase())) input.prompt = `${avatarTriggerWord}, ${prompt}`
    }

    const submitted = await submitFalGeneration({
      model: falModel,
      input,
      prompt: input.prompt,
      key: keys.fal,
      account: auth.account,
    })
    return json(200, {
      ok: true,
      taskId: submitted.taskId,
      kind: 'image',
      model: modelId,
      prompt: input.prompt,
      params: submitted.trackedInput,
      provider: 'fal',
      ...submitted.stored,
    })
  }

  if (!keys.kie) return json(403, { error: 'KIE_KEY_REQUIRED' })
  if (videos.length) return json(400, { error: `${modelId} does not accept a source video. Select Video Edit.` })

  const isCarInteriorPreset = typeof prompt === 'string' && prompt.startsWith(CAR_INTERIOR_PREFIX)
  if (isCarInteriorPreset) {
    if (!CAR_INTERIOR_MODELS.includes(modelId)) modelId = CAR_INTERIOR_SEEDANCE
    params = { ...params, duration: 10 }
    brand = true
    if (modelId === CAR_INTERIOR_SEEDANCE) {
      params.resolution = '4k'
      if (!['1:1','4:3','3:4','16:9','9:16','21:9','adaptive'].includes(params.aspect_ratio)) params.aspect_ratio = '9:16'
    } else {
      delete params.resolution
      if (!['1:1','16:9','9:16'].includes(params.aspect_ratio)) params.aspect_ratio = '9:16'
    }
    if (images.length !== 3) return json(400, { error: 'Car Interior requires exactly 3 reference images in sequence: driver door, front cabin, rear seating.' })
  }

  if (modelId === GPT_IMAGE_EDIT && params.aspect_ratio === '4:5') params = { ...params, aspect_ratio: '3:4' }
  else if (modelId === GPT_IMAGE_EDIT && params.aspect_ratio === '5:4') params = { ...params, aspect_ratio: '4:3' }
  if (modelId === NANO_BANANA_EDIT && params.resolution) { params = { ...params }; delete params.resolution }

  const registeredModel = byId(modelId)
  const model = registeredModel && modelId === HAPPYHORSE_REFERENCE_ID
    ? { ...registeredModel, images: HAPPYHORSE_REFERENCE_IMAGES }
    : registeredModel
  if (!model) return json(400, { error: `Unknown model: ${modelId}` })
  if (model.supported === false) return json(400, { error: `${model.label} needs the ${model.api} transport, not implemented.` })
  if (images.length && !model.images) return json(400, { error: `${model.label} accepts no reference images.` })
  if (model.images?.required && !images.length && !brand) return json(400, { error: `${model.label} requires at least one image.` })
  if (model.images && images.length > model.images.max) return json(400, { error: `${model.label} accepts at most ${model.images.max} images.` })
  if (params.aspect_ratio && model.aspects && !model.aspects.includes(params.aspect_ratio)) return json(400, { error: `${model.label} does not support ${params.aspect_ratio}. It supports ${model.aspects.join(', ')}.` })
  if (params.resolution && model.resolutions && !model.resolutions.includes(params.resolution)) return json(400, { error: `${model.label} does not support ${params.resolution}. It supports ${model.resolutions.join(', ')}.` })

  const chosen = STYLES[style]
  if (chosen) {
    if (model.styleEnum?.includes(chosen.enum)) params.style = chosen.enum
    else prompt = `${prompt.replace(/[.\s]+$/, '')}. ${chosen.prompt}`
  }

  const hosted = []
  for (let i = 0; i < images.length; i++) hosted.push(await toHostedUrl(images[i], i, keys.kie))
  if (brand && model.images) {
    const base = process.env.URL || process.env.DEPLOY_PRIME_URL
    if (!base) return json(500, { error: 'Cannot resolve the site URL for the logo.' })
    if (hosted.length >= model.images.max) return json(400, { error: `${model.label} accepts ${model.images.max} images; the logo needs one of them.` })
    hosted.push(`${base}/logo/logo.PNG`)
  } else if (brand && !model.images) return json(400, { error: `${model.label} cannot use the logo because it accepts no reference images.` })

  const input = { prompt, ...params }
  if (hosted.length && model.images) input[model.images.param] = hosted
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL
  const cb = base ? `${base}/.netlify/functions/callback` : undefined
  const taskId = await createTask(modelId, input, cb, keys.kie)
  const stored = await storeQueued({ model, prompt, taskId, input, credits: Number(model.credits || 0), accountId: auth.account.id })
  await trackUsage(auth.account, 'kie', Number(model.credits || 0))
  return json(200, { ok: true, taskId, kind: model.kind, model: modelId, prompt, params: input, provider: 'kie', ...stored })
})