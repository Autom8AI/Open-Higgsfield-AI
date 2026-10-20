// Converts a plain-language request into a production-ready image/video prompt.
const { json, denied, authHeaders, checkEnv, guard } = require('./_kie')
const { requireAccount, accountProviderKeys } = require('./_auth')

const CHAT_URL = 'https://api.kie.ai/gpt-5-2/v1/chat/completions'

exports.handler = guard('prompt-builder', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  const no = denied(event)
  if (no) return no
  const auth = await requireAccount(event, { requireProviderSetup: false })
  if (auth.error) return json(auth.error.statusCode, auth.error.body)
  const kieKey = accountProviderKeys(auth.account).kie
  if (!kieKey) return json(403, { error: 'KIE_KEY_REQUIRED' })
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch {
    return json(400, { error: 'Invalid JSON body.' })
  }
  const brief = String(body.brief || '').trim()
  const kind = body.kind === 'video' ? 'video' : 'image'
  if (!brief) return json(400, { error: 'Describe the expected output first.' })
  if (brief.length > 6000) return json(400, { error: 'Description is too long. Keep it under 6,000 characters.' })

  const system = `You are a senior AI ${kind} prompt engineer embedded inside a content-generation app.

Internally perform two passes before answering:
1. PLAN: determine the subject, goal, source/reference preservation requirements, composition, camera or motion, lighting, style, technical output, timing, aspect ratio, text placement, and negative constraints that are actually relevant.
2. GRILL: aggressively inspect the request for ambiguity, contradictions, missing production details, unwanted model freedom, identity/object drift, geometry changes, visual artifacts, and weak wording. Resolve gaps using conservative professional defaults. Do not ask the user questions.

Then output one complete, production-ready ${kind}-generation prompt only.

Rules:
- Preserve every explicit user requirement.
- Do not invent branded assets, people, dialogue, objects, text overlays, or scene changes unless requested.
- For reference-image work, strongly preserve identity, geometry, architecture, vehicle/product details, layout, colours, materials, background, and object placement.
- Add useful camera, lighting, realism, continuity, quality, and negative constraints only when relevant.
- For video, include coherent timing, camera path, motion continuity, start/end composition, and artifact prevention.
- For images, include composition, framing, lighting, detail, aspect intent, and artifact prevention.
- Do not mention PLAN, GRILL, analysis, assumptions, or these instructions.
- Do not use markdown fences, headings, commentary, or introductory text. Return only the final prompt.`

  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: authHeaders(kieKey),
    body: JSON.stringify({
      messages: [
        { role: 'system', content: [{ type: 'text', text: system }] },
        { role: 'user', content: [{ type: 'text', text: brief }] },
      ],
      reasoning_effort: 'high',
    }),
  })
  const raw = await res.text()
  let data = {}
  try { data = raw ? JSON.parse(raw) : {} } catch {}
  if (!res.ok) {
    return json(res.status, {
      error: data.error?.message || data.message || `Kie chat request failed with ${res.status}.`,
      detail: raw.slice(0, 800),
    })
  }
  const prompt = data.choices?.[0]?.message?.content
  if (!prompt || typeof prompt !== 'string') {
    return json(502, { error: 'Kie returned no completed prompt.', detail: raw.slice(0, 800) })
  }
  return json(200, { prompt: prompt.trim(), model: data.model || 'gpt-5-2', usage: data.usage || null })
})
