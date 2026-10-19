// Airtable storage — DIRECT PAT calls, hardcoded IDs mirroring motivquotez.
// Champion Auto Spa media base appSYUhlcApc5k3PO, no Composio, no env indirection
// for base/table (hardcoded like motivquotez's PRIMARY_BASE_ID / TABLE_ID).

const BASE_ID = 'appSYUhlcApc5k3PO' // Champion Auto Spa — hardcoded
const GENERATIONS = 'tbleSsBerfkEtTFTk' // Generations — hardcoded
const AVATARS = 'tblsT27uHkU21Csq0' // Avatars — hardcoded

function normalizeToken(raw) {
  let token = String(raw || '').trim()

  if ((token.startsWith('"') && token.endsWith('"'))
      || (token.startsWith("'") && token.endsWith("'"))
      || (token.startsWith('`') && token.endsWith('`'))) {
    token = token.slice(1, -1).trim()
  }

  token = token.replace(/^Authorization\s*:\s*/i, '').trim()
  token = token.replace(/^Bearer\s+/i, '').trim()
  return token
}

const auth = () => normalizeToken(
  process.env.AIRTABLE_AUTH
    || process.env.AIRTABLE_API_KEY
    || process.env.AIRTABLE_TOKEN
    || process.env.AIRTABLE_PAT
)

const headers = () => ({
  Authorization: `Bearer ${auth()}`,
  'Content-Type': 'application/json',
})

const api = (table, suffix = '') =>
  `https://api.airtable.com/v0/${BASE_ID}/${table}${suffix}`

async function airtableFetch(url, options = {}) {
  if (!auth()) throw new Error('Airtable credentials are not configured (AIRTABLE_AUTH).')
  const res = await fetch(url, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const rawError = body?.error
    const message = typeof rawError === 'string'
      ? rawError
      : (rawError?.message || (rawError ? JSON.stringify(rawError) : `Airtable request failed (${res.status})`))
    const error = new Error(message)
    error.status = res.status
    throw error
  }
  return body
}

// Legacy raw call(url, options) — nothing in this repo calls it directly (only
// listRecords/createRecord/updateRecord/deleteRecord/GENERATIONS are imported elsewhere,
// confirmed by search) but it stays exported in case something does.
async function call(url, options = {}) {
  return airtableFetch(url, options)
}

async function listRecords(table, { sortField, max = 100, filter } = {}) {
  const params = new URLSearchParams()
  params.set('pageSize', String(Math.min(max, 100)))
  if (sortField) {
    params.set('sort[0][field]', sortField)
    params.set('sort[0][direction]', 'desc')
  }
  if (filter) params.set('filterByFormula', filter)
  const data = await airtableFetch(api(table, `?${params.toString()}`), { method: 'GET' })
  return data.records || []
}

async function assertAccess(table = GENERATIONS) {
  await airtableFetch(api(table, '?pageSize=1'), { method: 'GET' })
  return true
}

const createRecord = (table, fields) =>
  airtableFetch(api(table), {
    method: 'POST',
    body: JSON.stringify({ fields, typecast: true }),
  })

const updateRecord = (table, id, fields) =>
  airtableFetch(api(table, `/${id}`), {
    method: 'PATCH',
    body: JSON.stringify({ fields, typecast: true }),
  })

const deleteRecord = (table, id) =>
  airtableFetch(api(table, `/${id}`), { method: 'DELETE' })

module.exports = {
  BASE_ID,
  GENERATIONS,
  AVATARS,
  auth,
  call,
  assertAccess,
  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,
}
