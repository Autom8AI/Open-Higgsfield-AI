// Upload one small reference image to Kie.ai's temporary CDN and return a hosted URL.
// Large source videos use the separate /upload-stream edge route.
const { json, toHostedUrl, guard } = require('./_kie')
const { requireAccount, accountProviderKeys } = require('./_auth')

exports.handler = guard('upload', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const auth = await requireAccount(event)
  if (auth.error) return json(auth.error.statusCode, auth.error.body)
  const kie = accountProviderKeys(auth.account).kie
  if (!kie) return json(403, { error: 'KIE_KEY_REQUIRED' })

  const body = JSON.parse(event.body || '{}')
  const image = body.image
  if (typeof image !== 'string' || !image) {
    return json(400, { error: 'Image data is required.' })
  }
  if (!image.startsWith('data:image/') && !/^https?:\/\//i.test(image)) {
    return json(400, { error: 'A valid image upload or public image URL is required.' })
  }

  const index = Number.isFinite(Number(body.index)) ? Number(body.index) : 0
  const url = await toHostedUrl(image, index, kie)
  return json(200, { ok: true, url })
})
