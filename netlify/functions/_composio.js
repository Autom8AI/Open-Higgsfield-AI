// Composio transport — the single server-side credential (COMPOSIO_API_KEY).
// All Airtable storage flows through Composio's proxy-execute with the ACTIVE
// airtable connected account, so no Airtable PAT or KIE site key is needed.
// Kie.ai generation keeps using each signed-in account's own Kie key stored in
// the App Auth table (also fetched through Composio).

const BASE = 'https://backend.composio.dev/api/v3.1'

const ORG_ID = process.env.COMPOSIO_ORG_ID || 'ok_BENL25Qrhbop'
const PROJECT_ID = process.env.COMPOSIO_PROJECT_ID || 'pr_fb2sLe69ksF_'

const apiKey = () => String(process.env.COMPOSIO_API_KEY || '').trim()
const hasComposio = () => Boolean(apiKey())

// ak_ keys are org keys sent via x-api-key; uak_ keys are user keys that need
// the org/project headers. Both are accepted by the v3.1 proxy.
const authHeadersFor = () => apiKey().startsWith('ak_')
  ? { 'x-api-key': apiKey() }
  : {
      'x-user-api-key': apiKey(),
      'x-org-id': ORG_ID,
      'x-project-id': PROJECT_ID,
    }

let accountCache = { at: 0, items: [] }

async function listAccounts() {
  if (Date.now() - accountCache.at < 4 * 60 * 1000 && accountCache.items.length) {
    return accountCache.items
  }
  if (!hasComposio()) throw new Error('Composio credentials are not configured (COMPOSIO_API_KEY).')
  const res = await fetch(`${BASE}/connected_accounts?limit=100`, {
    headers: { ...authHeadersFor(), Accept: 'application/json' },
  })
  const text = await res.text()
  let body = {}
  try { body = text ? JSON.parse(text) : {} } catch {}
  if (!res.ok) {
    const message = body?.error?.message || body?.message || `Composio accounts request failed (${res.status})`
    const error = new Error(`Composio: ${message}`)
    error.status = res.status
    throw error
  }
  const items = body.items || []
  accountCache = { at: Date.now(), items }
  return items
}

async function activeAccount(toolkit) {
  const items = await listAccounts()
  const match = items.find((a) =>
    String((a.toolkit && (a.toolkit.slug || a.toolkit)) || a.toolkitSlug || '').toLowerCase() === String(toolkit).toLowerCase()
    && ['ACTIVE', 'active'].includes(String(a.status || '').toUpperCase())
  )
  if (!match) {
    const error = new Error(`Composio: no ACTIVE connected account for "${toolkit}".`)
    error.composioMissing = true
    throw error
  }
  return match
}

async function proxyExecute(accountId, endpoint, method = 'GET', body = undefined) {
  if (!hasComposio()) throw new Error('Composio credentials are not configured (COMPOSIO_API_KEY).')
  const payload = { connected_account_id: accountId, endpoint, method }
  if (body !== undefined) payload.body = body
  const res = await fetch(`${BASE}/tools/execute/proxy`, {
    method: 'POST',
    headers: { ...authHeadersFor(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let outer = {}
  try { outer = text ? JSON.parse(text) : {} } catch {
    outer = { error: { message: String(text).slice(0, 300) } }
  }
  if (!res.ok) {
    const message = outer?.error?.message || outer?.error || `Composio proxy request failed (${res.status})`
    const error = new Error(`Composio: ${typeof message === 'string' ? message : JSON.stringify(message).slice(0, 300)}`)
    error.status = res.status
    throw error
  }
  return {
    status: Number(outer.status ?? res.status),
    data: outer.data,
    headers: outer.headers || {},
  }
}

// fetch()-shaped wrapper for a toolkit-hosted absolute URL. Returns
// { ok, status, text, json } so call sites keep their existing semantics.
async function toolkitFetch(toolkit, url, options = {}) {
  const account = await activeAccount(toolkit)
  const method = String(options.method || 'GET').toUpperCase()
  let body = options.body
  if (body !== undefined && body !== null && method !== 'GET' && method !== 'DELETE') {
    // Composio expects the JSON body as an OBJECT (it serializes it itself);
    // pass-through strings get double-encoded and Airtable then reports
    // "Could not parse request body", so decode first.
    if (typeof body === 'string') {
      try { body = JSON.parse(body) } catch { body = { raw: body } }
    } else if (typeof body !== 'object') {
      body = { value: body }
    }
  }
  try {
    const result = await proxyExecute(account.id, url, method, body)
    let parsed
    let text = ''
    if (result.data === undefined || result.data === null) {
      parsed = {}
    } else if (typeof result.data === 'object') {
      parsed = result.data
      try { text = JSON.stringify(result.data) } catch { text = '' }
    } else {
      text = String(result.data)
      try { parsed = JSON.parse(text) } catch { parsed = { raw: text } }
    }
    return { ok: result.status >= 200 && result.status < 300, status: result.status, text, json: () => parsed }
  } catch (error) {
    // Map Composio-transport errors onto a fetch-like failure shape.
    const wrapped = new Error(error.message)
    wrapped.status = error.status || 0
    wrapped.composioTransport = true
    wrapped.className = error.composioMissing ? 'composio-no-account' : undefined
    throw wrapped
  }
}

module.exports = {
  apiKey,
  hasComposio,
  ORG_ID,
  PROJECT_ID,
  listAccounts,
  activeAccount,
  proxyExecute,
  toolkitFetch,
}
