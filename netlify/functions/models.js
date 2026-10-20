// The model registry, annotated with published fal.ai pricing and costs measured from real runs.
const { json, denied, models, checkEnv, guard } = require('./_kie')
const { GENERATIONS, listRecords } = require('./_airtable')

const HAPPYHORSE_1_1_REFERENCE_ID = 'happyhorse-1-1/reference-to-video'

// Kie currently documents this route separately from HappyHorse 1.1. Keep it
// outside the generated registry so both documented variants remain available.
const KIE_EXTRA_MODELS = [
  {
    id: 'happyhorse/reference-to-video',
    label: 'HappyHorse Reference to Video',
    provider: 'kie',
    kind: 'video',
    api: 'jobs',
    blurb: 'Reference-driven video generation from one selected avatar portrait.',
    images: { param: 'reference_image', max: 5, required: true },
    aspects: ['16:9', '9:16', '3:4', '4:3', '4:5', '5:4', '1:1', '9:21', '21:9'],
    resolutions: ['720p', '1080p'],
    resolutionDefault: '1080p',
    hasDuration: true,
  },
]

// Content Factory uses 1 credit = US$0.01 internally for fal.ai estimates.
// User-facing balances and generation costs are displayed only in credits.
const FAL_MODELS = [
  {
    id: 'fal-ai/flux-pro/kontext',
    label: 'FLUX Kontext Pro',
    provider: 'fal',
    kind: 'image',
    api: 'fal',
    blurb: 'Premium image-reference editing with strong realism and scene preservation.',
    images: { param: 'image_url', max: 1, required: true },
    aspects: ['1:1', '4:5', '3:4', '16:9', '9:16'],
    pricing: { credits: 4, unit: 'cr/image', runs: 0, usd: 0.04, source: 'published' },
  },
  {
    id: 'fal-ai/flux-lora',
    label: 'FLUX LoRA Realistic',
    provider: 'fal',
    kind: 'image',
    api: 'fal',
    blurb: 'Realistic text-to-image and trained-avatar LoRA generation.',
    aspects: ['1:1', '4:5', '3:4', '16:9', '9:16'],
    pricing: { credits: 3.5, unit: 'cr/MP', runs: 0, usd: 0.035, source: 'published' },
  },
  {
    id: 'alibaba/happy-horse/video-edit',
    label: 'Happy Horse Video Edit',
    provider: 'fal',
    kind: 'video',
    api: 'fal',
    blurb: 'Edits one source video using a prompt and up to five visual reference images.',
    images: { param: 'reference_image_urls', max: 5, required: true },
    videos: { param: 'video_url', max: 1, required: true },
    resolutions: ['720p', '1080p'],
    resolutionDefault: '1080p',
    pricing: {
      credits: 28,
      unit: 'cr/sec',
      runs: 0,
      usd: 0.28,
      source: 'published',
      byResolution: {
        '720p': { credits: 14, unit: 'cr/sec', usd: 0.14, runs: 0 },
        '1080p': { credits: 28, unit: 'cr/sec', usd: 0.28, runs: 0 },
      },
    },
  },
]

function normalizeModel(model) {
  if (model.id !== HAPPYHORSE_1_1_REFERENCE_ID) return model
  return {
    ...model,
    blurb: 'HappyHorse 1.1 reference-driven video generation using uploaded images.',
    images: { param: 'reference_image', max: 5, required: true },
  }
}

const allModels = () => [...models().map(normalizeModel), ...KIE_EXTRA_MODELS, ...FAL_MODELS]

exports.handler = guard('models', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  const gate = denied(event); if (gate) return gate
  const env = checkEnv({ airtable: false, kie: false }); if (env) return env

  let records = []
  try {
    records = await listRecords(GENERATIONS, { sortField: 'Created', max: 100 })
  } catch (err) {
    return json(200, { ok: true, pricingError: err.message, models: allModels() })
  }

  const seen = {}
  for (const r of records) {
    const f = r.fields || {}
    let params = {}
    try { params = JSON.parse(f.Params || '{}') } catch {}
    const credits = Number(params._credits) || 0
    if (!credits || !f.Model) continue
    const isVideo = (f.Type || '').toLowerCase() === 'video'
    const duration = Number(params.duration || params._duration) || 0
    const value = isVideo && duration ? credits / duration : credits
    const unit = isVideo && duration ? 'cr/sec' : (isVideo ? 'cr/video' : 'cr/image')
    const res = String(params.resolution || params.output_resolution || '')
    const s = (seen[f.Model] ||= { unit, samples: [], byRes: {} })
    s.samples.push(value)
    if (res) (s.byRes[res] ||= []).push(value)
  }

  const avg = (a) => Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10
  const measured = {}
  for (const [id, s] of Object.entries(seen)) {
    measured[id] = {
      unit: s.unit,
      runs: s.samples.length,
      credits: avg(s.samples),
      source: 'measured',
      byResolution: Object.fromEntries(
        Object.entries(s.byRes).map(([r, v]) => [r, { credits: avg(v), unit: s.unit, runs: v.length }]),
      ),
    }
  }

  return json(200, {
    ok: true,
    models: allModels().map((model) => {
      const observed = measured[model.id]
      if (!observed) return model
      if (!model.pricing) return { ...model, pricing: observed }
      return {
        ...model,
        pricing: {
          ...model.pricing,
          runs: observed.runs,
          measuredCredits: observed.credits,
          measuredUnit: observed.unit,
          measuredByResolution: observed.byResolution,
        },
      }
    }),
  })
})
