const { json } = require('./_kie')

exports.handler = async function () {
  try {
    const key = process.env.COMPOSIO_API_KEY
    if (!key) return json(500, { error: 'COMPOSIO_API_KEY missing at runtime' })
    const userId = process.env.COMPOSIO_USER_ID || ''
    const prefix = key.slice(0, 8)
    const orgId = process.env.COMPOSIO_ORG_ID || 'ok_BENL25Qrhbop'

    const headerSets = [
      { name: 'x-org-api-key', headers: { 'x-org-api-key': key } },
      { name: 'x-org-api-key+org', headers: { 'x-org-api-key': key, 'x-org-id': orgId } },
      { name: 'x-user-api-key', headers: { 'x-user-api-key': key, 'x-org-id': orgId } },
      { name: 'x-api-key', headers: { 'x-api-key': key, 'x-org-id': orgId } },
      { name: 'x-api-key-bare', headers: { 'x-api-key': key } },
      { name: 'bearer', headers: { Authorization: `Bearer ${key}` } }
    ]
    const base = 'https://backend.composio.dev'
    const urls = [
      `/api/v3/connected_accounts?limit=50${userId ? `&user_id=${encodeURIComponent(userId)}` : ''}`,
      `/api/v1/connectedAccounts${userId ? `?userIds=${encodeURIComponent(userId)}` : ''}`
    ]

    const results = []
    for (const hs of headerSets) {
      for (const path of urls) {
        try {
          const res = await fetch(base + path, {
            headers: { ...hs.headers, Accept: 'application/json' },
            signal: AbortSignal.timeout(15000)
          })
          const text = await res.text()
          results.push({ header: hs.name, path: path.slice(0, 22), status: res.status, sample: text.slice(0, 240) })
          if (res.ok) {
            const parsed = JSON.parse(text)
            const accounts = parsed.items || parsed
            const summary = (Array.isArray(accounts) ? accounts : []).map(a => ({
              id: a.id,
              toolkit: a.toolkit || (a.app && (a.app.name || a.app)) || '?',
              status: a.status,
              userId: a.userId || a.user_id
            }))
            return json(200, { ok: true, via: hs.name, path, count: summary.length, accounts: summary, keyPrefix: prefix })
          }
        } catch (e) {
          results.push({ header: hs.name, path: path.slice(0, 22), error: e.message })
        }
      }
    }
    return json(500, { keyPrefix: prefix, userIdPresent: !!userId, orgId, attempts: results })
  } catch (e) {
    return json(500, { error: e.message })
  }
}
