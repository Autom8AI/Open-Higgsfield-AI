const { json, guard } = require('./_kie')
const {
  findAccountByName,
  isActive,
  lockedUntil,
  pinMatches,
  recordFailure,
  recordSuccess,
  sessionCookie,
  checkIpLimit,
  checkDeviceLimit,
} = require('./_auth')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

exports.handler = guard('login', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const body = JSON.parse(event.body || '{}')
  const name = String(body.name || '').trim()
  const pin = String(body.pin || '').trim()

  if (!name || !pin) {
    return json(400, { error: 'Enter your first name and PIN.' })
  }

  // Per-IP / per-device limits (before Airtable, same 5 attempts / 30m for all)
  const ipLock = checkIpLimit(event)
  if (ipLock) return json(429, { error: `Too many attempts from this network. Try again after ${ipLock.toLocaleTimeString()}.`, lockedUntil: ipLock.toISOString() })
  const devLock = checkDeviceLimit(event)
  if (devLock) return json(429, { error: `Too many attempts from this browser. Try again after ${devLock.toLocaleTimeString()}.`, lockedUntil: devLock.toISOString() })

  const account = await findAccountByName(name)
  if (!account || !isActive(account)) {
    try { await recordFailure({ id: `unknown:${String(name).toLowerCase()}`, fields: {} }, event) } catch {}
    await delay(900)
    return json(401, { error: 'Invalid name or PIN.' })
  }

  const lock = lockedUntil(account)
  if (lock) {
    return json(429, {
      error: `Too many failed attempts. Locked for 30 minutes. Try again after ${lock.toLocaleTimeString()}.`,
      lockedUntil: lock.toISOString(),
    })
  }

  if (!pinMatches(account, pin)) {
    try { await recordFailure(account, event) } catch {}
    await delay(900)
    return json(401, { error: 'Invalid name or PIN.' })
  }

  const token = await recordSuccess(account, pin, event)
  const response = json(200, {
    ok: true,
    account: {
      name: account.fields['First Name'] || account.fields.Name,
      providerSetupComplete: Boolean(account.fields['Provider Setup Complete']),
      hasKie: Boolean(account.fields['Kie API Key']),
      hasFal: Boolean(account.fields['fal API Key']),
    },
  })

  response.headers['Set-Cookie'] = sessionCookie(token)
  response.headers['Access-Control-Allow-Credentials'] = 'true'
  return response
})
