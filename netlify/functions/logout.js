const { json, guard } = require('./_kie')
const { clearSessionCookie } = require('./_auth')

exports.handler = guard('logout', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })
  const response = json(200, { ok: true })
  response.headers['Set-Cookie'] = clearSessionCookie()
  return response
})
