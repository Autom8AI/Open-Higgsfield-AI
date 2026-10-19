const { json, guard } = require('./_kie')
const { issueCaptcha } = require('./_auth')

exports.handler = guard('captcha', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  return json(200, issueCaptcha())
})
