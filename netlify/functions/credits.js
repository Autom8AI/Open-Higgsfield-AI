const { json, denied, authHeaders, guard } = require('./_kie')
const { requireAccount, accountProviderKeys } = require('./_auth')

exports.handler = guard('credits', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, {})
  const blocked = denied(event)
  if (blocked) return blocked
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' })

  const auth = await requireAccount(event, { requireProviderSetup: false })
  if (auth.error) return json(auth.error.statusCode, auth.error.body)
  const key = accountProviderKeys(auth.account).kie
  if (!key) return json(403, { error: 'KIE_KEY_REQUIRED' })

  const res = await fetch('https://api.kie.ai/api/v1/chat/credit', {
    headers: authHeaders(key),
  })
  const raw = await res.text()
  let data = {}
  try { data = raw ? JSON.parse(raw) : {} } catch {}

  if (!res.ok || data.code !== 200) {
    return json(res.status || 502, {
      error: `Kie credit lookup failed (${res.status}/${data.code || 'unknown'}).`,
      detail: data.msg || data.message || raw.slice(0, 400),
    })
  }

  return json(200, { credits: Number(data.data) || 0 })
})
