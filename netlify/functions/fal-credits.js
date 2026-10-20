const { json, denied, guard } = require('./_kie')
const { requireAccount, accountProviderKeys } = require('./_auth')

const CREDITS_PER_USD = 100

function toAppCredits(balance) {
  const usd = Number(balance || 0)
  if (!Number.isFinite(usd) || usd <= 0) return 0
  return Math.round(usd * CREDITS_PER_USD * 100) / 100
}

exports.handler = guard('fal-credits', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  const gate = denied(event); if (gate) return gate

  const auth = await requireAccount(event, { requireProviderSetup: false })
  if (auth.error) return json(auth.error.statusCode, auth.error.body)
  const key = accountProviderKeys(auth.account).fal
  if (!key) return json(403, { error: 'FAL_KEY_REQUIRED' })

  const res = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', {
    headers: { Authorization: `Key ${key}` },
  })
  const raw = await res.text()
  let data = {}
  try { data = raw ? JSON.parse(raw) : {} } catch {}
  if (!res.ok) return json(res.status, { error: data.detail || data.error || raw.slice(0, 300) })

  return json(200, {
    ok: true,
    credits: toAppCredits(data.credits?.current_balance),
  })
})