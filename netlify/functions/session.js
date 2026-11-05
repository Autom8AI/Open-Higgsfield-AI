const { json, guard } = require('./_kie')
const { requireAccount, parseCookies, verifySessionToken, SESSION_COOKIE } = require('./_auth')

exports.handler = guard('session', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' })
  // Default: verify the signed, expiring session cookie only (no Airtable round
  // trip) so the app can open fast. Every data endpoint still loads and checks
  // the account itself. `?full=1` returns the account details.
  if ((event.queryStringParameters || {}).full !== '1') {
    const session = verifySessionToken(parseCookies(event)[SESSION_COOKIE], event)
    if (!session) return json(401, { error: 'AUTH_REQUIRED' })
    return json(200, { ok: true, sub: session.sub })
  }
  const auth = await requireAccount(event, { requireProviderSetup: false })
  if (auth.error) return json(auth.error.statusCode, auth.error.body)
  const { account } = auth
  return json(200, {
    ok: true,
    sub: auth.session.sub,
    account: {
      name: account.fields['First Name'] || account.fields.Name,
      providerSetupComplete: Boolean(account.fields['Provider Setup Complete']),
      hasKie: Boolean(account.fields['Kie API Key']),
      hasFal: Boolean(account.fields['fal API Key']),
    },
  })
})
