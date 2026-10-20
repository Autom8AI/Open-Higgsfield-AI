const { json, guard } = require('./_kie')
const { requireAccount } = require('./_auth')

exports.handler = guard('session', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' })
  const auth = await requireAccount(event, { requireProviderSetup: false })
  if (auth.error) return json(auth.error.statusCode, auth.error.body)
  const { account } = auth
  return json(200, {
    ok: true,
    account: {
      name: account.fields['First Name'] || account.fields.Name,
      providerSetupComplete: Boolean(account.fields['Provider Setup Complete']),
      hasKie: Boolean(account.fields['Kie API Key']),
      hasFal: Boolean(account.fields['fal API Key']),
    },
  })
})
