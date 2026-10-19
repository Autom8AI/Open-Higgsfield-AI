function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.local') || host === '::1') return true
  if (/^(127|0)\./.test(host)) return true
  if (/^10\./.test(host)) return true
  if (/^169\.254\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  const match = host.match(/^172\.(\d+)\./)
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true
  return false
}

function safeName(value, contentType) {
  let name = String(value || 'matai-result').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120)
  if (!name.includes('.')) {
    if (String(contentType).includes('video')) name += '.mp4'
    else if (String(contentType).includes('jpeg')) name += '.jpg'
    else if (String(contentType).includes('webp')) name += '.webp'
    else name += '.png'
  }
  return name || 'matai-result'
}

export default async (request) => {
  const requestUrl = new URL(request.url)
  const configuredCode = globalThis.Netlify?.env?.get?.('ACCESS_CODE') || ''
  const suppliedCode = requestUrl.searchParams.get('code') || ''

  if (configuredCode && suppliedCode !== configuredCode) {
    return new Response('Unauthorized', { status: 401 })
  }

  const sourceValue = requestUrl.searchParams.get('url')
  if (!sourceValue) return new Response('Missing media URL', { status: 400 })

  let source
  try {
    source = new URL(sourceValue)
  } catch {
    return new Response('Invalid media URL', { status: 400 })
  }

  if (!['https:', 'http:'].includes(source.protocol) || isPrivateHost(source.hostname)) {
    return new Response('Media host is not allowed', { status: 400 })
  }

  let upstream
  try {
    upstream = await fetch(source.toString(), {
      redirect: 'follow',
      headers: { 'User-Agent': 'MATAI-Media-Download/1.0' },
    })
  } catch (error) {
    return new Response(`Could not fetch media: ${error.message}`, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(`Media fetch failed (${upstream.status})`, { status: 502 })
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
  const filename = safeName(requestUrl.searchParams.get('name'), contentType)
  const headers = new Headers()
  headers.set('Content-Type', contentType)
  headers.set('Content-Disposition', `attachment; filename="${filename}"`)
  headers.set('Cache-Control', 'private, no-store, max-age=0')
  headers.set('X-Content-Type-Options', 'nosniff')

  const length = upstream.headers.get('content-length')
  if (length) headers.set('Content-Length', length)

  return new Response(upstream.body, {
    status: 200,
    headers,
  })
}
