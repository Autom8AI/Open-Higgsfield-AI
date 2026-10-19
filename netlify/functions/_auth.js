const crypto = require('crypto')

// Direct Airtable — mirrors motivquotez/netlify/functions/_auth.js hardcoding.
// Hardcoded IDs (no env indirection) per motivquotez pattern: primary applP85ZQYvmFGSxa
// (Autom8 Me CRM), fallback appxWa7YNYpMjIVAz (copy). No Composio.
const PRIMARY_BASE_ID = 'applP85ZQYvmFGSxa' // Autom8 Me CRM — hardcoded (motivquotez primary)
const FALLBACK_BASE_ID = 'appxWa7YNYpMjIVAz' // Autom8 Me CRM (copy) — hardcoded fallback
const BACKUP_BASE_ID = FALLBACK_BASE_ID
const AIRTABLE_BASE_ID = PRIMARY_BASE_ID
const AIRTABLE_TABLE_ID = 'tbloKNK7pmGiaEB1K' // App Auth — hardcoded
const SESSION_COOKIE = 'matai_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const CAPTCHA_TTL_SECONDS = 3 * 60
const LOCK_MINUTES = 30
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || process.env.OWNER_EMAIL || ''

// In-memory per-IP / per-device throttling (best-effort, survives warm invocations)
// Also persisted via Airtable per-user lock (authoritative). This covers bursts even before Airtable.
const ipStore = new Map() // ip -> { count, firstAt, lockedUntil }
const deviceStore = new Map() // deviceId -> { count, firstAt, lockedUntil }

function getClientIp(event) {
  const h = event.headers || {}
  return (
    h['x-nf-client-connection-ip'] ||
    h['x-forwarded-for']?.split(',')[0]?.trim() ||
    h['client-ip'] ||
    h['x-real-ip'] ||
    event.ip ||
    'unknown'
  )
}
function getDeviceId(event) {
  const h = event.headers || {}
  const ua = String(h['user-agent'] || '')
  const ip = getClientIp(event)
  const raw = `${ua}|${ip}`.slice(0, 300)
  return sha256(raw).slice(0, 16)
}
function checkLimit(store, key) {
  const rec = store.get(key)
  if (!rec) return null
  if (rec.lockedUntil && rec.lockedUntil > Date.now()) return new Date(rec.lockedUntil)
  if (Date.now() - rec.firstAt > WINDOW_MS) { store.delete(key); return null }
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCK_MINUTES * 60 * 1000
    store.set(key, rec)
    return new Date(rec.lockedUntil)
  }
  return null
}
function recordLimit(store, key) {
  const now = Date.now()
  let rec = store.get(key)
  if (!rec || now - rec.firstAt > WINDOW_MS) rec = { count: 0, firstAt: now, lockedUntil: 0 }
  rec.count += 1
  if (rec.count >= MAX_ATTEMPTS) rec.lockedUntil = now + LOCK_MINUTES * 60 * 1000
  store.set(key, rec)
  return rec
}
function checkIpLimit(event) { return checkLimit(ipStore, getClientIp(event)) }
function checkDeviceLimit(event) { return checkLimit(deviceStore, getDeviceId(event)) }
function recordIpFailure(event) { return recordLimit(ipStore, getClientIp(event)) }
function recordDeviceFailure(event) { return recordLimit(deviceStore, getDeviceId(event)) }
function resetIpDeviceOnSuccess(event) {
  ipStore.delete(getClientIp(event))
  deviceStore.delete(getDeviceId(event))
}

async function notifyLockout({ site, account, event, reason }) {
  const to = NOTIFY_EMAIL
  if (!to) return
  const ip = getClientIp(event)
  const ua = String(event.headers?.['user-agent'] || 'unknown')
  const name = account?.fields?.['First Name'] || account?.fields?.Name || account?.id || 'unknown'
  const now = new Date().toISOString()
  const lockedUntilStr = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toLocaleString('en-CA', { timeZone: 'America/Toronto' })
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#070707;font-family:Inter,Arial,sans-serif;color:#e6e6e6">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#0e0e0e;border:1px solid #1b1b1b;border-radius:12px;overflow:hidden">
<div style="background:linear-gradient(135deg,#c41010,#7a0a0a);padding:20px 24px">
<div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;opacity:.9">Security Alert</div>
<div style="font-size:20px;font-weight:800;margin-top:4px">🔒 Login suspended — ${site}</div>
</div>
<div style="padding:24px">
<p style="margin:0 0 16px;color:#999;font-size:13px">Too many failed attempts. The account is locked for <b style="color:#fff">${LOCK_MINUTES} minutes</b> (same rule for all apps).</p>
<table style="width:100%;border-collapse:collapse;font-size:13px">
<tr><td style="padding:8px 0;color:#666;border-bottom:1px solid #181818">Site</td><td style="padding:8px 0;color:#fff;text-align:right;border-bottom:1px solid #181818">${site}</td></tr>
<tr><td style="padding:8px 0;color:#666;border-bottom:1px solid #181818">Account</td><td style="padding:8px 0;color:#fff;text-align:right;border-bottom:1px solid #181818">${name}</td></tr>
<tr><td style="padding:8px 0;color:#666;border-bottom:1px solid #181818">Reason</td><td style="padding:8px 0;color:#fff;text-align:right;border-bottom:1px solid #181818">${reason}</td></tr>
<tr><td style="padding:8px 0;color:#666;border-bottom:1px solid #181818">Attempts</td><td style="padding:8px 0;color:#ff6666;text-align:right;border-bottom:1px solid #181818">${MAX_ATTEMPTS} in ${WINDOW_MS/60000} min</td></tr>
<tr><td style="padding:8px 0;color:#666;border-bottom:1px solid #181818">Locked until</td><td style="padding:8px 0;color:#fff;text-align:right;border-bottom:1px solid #181818">${lockedUntilStr} (Toronto)</td></tr>
<tr><td style="padding:8px 0;color:#666;border-bottom:1px solid #181818">IP</td><td style="padding:8px 0;color:#fff;text-align:right;border-bottom:1px solid #181818">${ip}</td></tr>
<tr><td style="padding:8px 0;color:#666">User-Agent</td><td style="padding:8px 0;color:#999;text-align:right;max-width:280px;word-break:break-all">${ua.slice(0, 180)}</td></tr>
</table>
<p style="margin:16px 0 0;color:#555;font-size:11px">Time: ${now} · Airtable: ${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}</p>
</div>
</div>
<p style="text-align:center;color:#333;font-size:11px;margin-top:12px">Autom8AI · Content Factory · MotivQuotez · Champion</p>
</div>
</body></html>`
  const subject = `🔒 ${site} — login suspended (${reason}) — ${name} — ${ip}`
  const text = `${site} lockout: ${name} / ${reason} / ${ip} / ${MAX_ATTEMPTS} attempts → locked ${LOCK_MINUTES}m until ${lockedUntilStr}`
  // Resend direct only — Composio removed (was GMAIL_SEND_EMAIL via backend.composio.dev)
  try {
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.RESEND_FROM || 'Security <notify@autom8ai.com>', to: [to], subject, html, text }),
      })
    }
  } catch {}
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

const SESSION_SECRET = sha256('matai-content-factory-session-v2') // hardcoded — no env needed
function secret() {
  return SESSION_SECRET
}

function sign(value, purpose) {
  return crypto.createHmac('sha256', secret()).update(`${purpose}:${value}`).digest('base64url')
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function authToken() {
  return (
    process.env.AIRTABLE_AUTH ||
    process.env.AIRTABLE_PAT ||
    process.env.AIRTABLE_API_KEY ||
    ''
  )
}

async function airtableRequest(baseId, path, options = {}) {
  const token = authToken()
  if (!token) {
    const error = new Error('Airtable credentials are not configured (AIRTABLE_AUTH).')
    error.code = 'AIRTABLE_UNAVAILABLE'
    throw error
  }

  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  let body = {}
  try { body = text ? JSON.parse(text) : {} } catch {}

  if (!response.ok) {
    const rawError = body?.error
    const message = typeof rawError === 'string'
      ? rawError
      : (rawError?.message || (rawError ? JSON.stringify(rawError) : `Airtable request failed (${response.status})`))
    const error = new Error(`Airtable request failed (${response.status}): ${message}`)
    error.status = response.status
    error.rateLimited = response.status === 429
    error.code = response.status === 401 || response.status === 403 ? 'AIRTABLE_AUTH_FAILED' : 'AIRTABLE_REQUEST_FAILED'
    throw error
  }
  return body
}

// Tries the primary base first; only falls back to the backup (copy) base when the primary
// call comes back rate-limited. Any other failure (auth, not-found, etc.) is NOT retried
// against the backup — a stale copy can't fix a bad credential or a missing record, and
// silently reading/writing the wrong base on unrelated errors would be worse than surfacing them.
async function withBaseFailover(run) {
  try {
    return await run(PRIMARY_BASE_ID)
  } catch (error) {
    if (error?.rateLimited && BACKUP_BASE_ID && BACKUP_BASE_ID !== PRIMARY_BASE_ID) {
      try {
        return await run(BACKUP_BASE_ID)
      } catch (fallbackError) {
        fallbackError.usedBackupBase = true
        throw fallbackError
      }
    }
    throw error
  }
}

function escapeFormula(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function findAccountByName(name) {
  const normalized = String(name || '').trim().toLowerCase()
  if (!normalized) return null
  // The App Auth table's primary field is "Name", but the actual first name now
  // lives in a separate "First Name" field added later -- "Name" is blank on the
  // existing record. Match either so a lookup keeps working regardless of which
  // field a given record actually uses.
  const escaped = escapeFormula(normalized)
  const formula = `OR(LOWER({Name})='${escaped}', LOWER({First Name})='${escaped}')`
  const data = await withBaseFailover((baseId) =>
    airtableRequest(baseId, `${AIRTABLE_TABLE_ID}?filterByFormula=${encodeURIComponent(formula)}&pageSize=1`, { method: 'GET' })
  )
  return data?.records?.[0] || null
}

async function getAccount(id) {
  try {
    return await withBaseFailover((baseId) =>
      airtableRequest(baseId, `${AIRTABLE_TABLE_ID}/${id}`, { method: 'GET' })
    )
  } catch (error) {
    if (error.code === 'AIRTABLE_AUTH_FAILED' || error.code === 'AIRTABLE_UNAVAILABLE') throw error
    return null
  }
}

async function updateAccount(id, fields) {
  return withBaseFailover((baseId) =>
    airtableRequest(baseId, `${AIRTABLE_TABLE_ID}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    })
  )
}

function normalizePin(pin) {
  return String(pin ?? '').trim()
}

function pinMatches(account, pin) {
  const submitted = normalizePin(pin)
  const stored = normalizePin(account?.fields?.['PIN Hash'] || account?.fields?.PIN)
  if (!stored) return false
  if (!stored.includes(':')) return safeEqual(submitted, stored)

  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const actual = crypto.scryptSync(submitted, Buffer.from(salt, 'hex'), 32).toString('hex')
  return safeEqual(actual, hash)
}

function isActive(account) {
  const status = String(account?.fields?.Status || 'Active').toLowerCase()
  return ['active', 'enabled', 'approved'].includes(status)
}

function lockedUntil(account) {
  const raw = account?.fields?.['Locked Until']
  const date = raw ? new Date(raw) : null
  return date && Number.isFinite(date.getTime()) && date > new Date() ? date : null
}

async function recordFailure(account, event) {
  const now = new Date()
  const rawStart = account?.fields?.['Failed Window Started']
  const start = rawStart ? new Date(rawStart) : null
  const expired = !start || !Number.isFinite(start.getTime()) || now - start > WINDOW_MS
  const attempts = (expired ? 0 : Number(account?.fields?.['Failed Login Attempts'] || 0)) + 1
  const fields = {
    'Failed Login Attempts': attempts,
    'Failed Window Started': expired ? now.toISOString() : start.toISOString(),
    'Last Failed Login': now.toISOString(),
  }
  let locked = false
  if (attempts >= MAX_ATTEMPTS) {
    fields['Locked Until'] = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
    fields['Failed Login Attempts'] = 0
    fields['Failed Window Started'] = null
    locked = true
  }
  try { await updateAccount(account.id, fields) } catch {}
  if (locked && event) {
    try { await notifyLockout({ site: 'content-factory', account, event, reason: 'per-user limit' }) } catch {}
  }
  if (event) {
    const ipRec = recordIpFailure(event)
    if (ipRec.count === MAX_ATTEMPTS) try { await notifyLockout({ site: 'content-factory', account, event, reason: 'per-IP limit' }) } catch {}
    const devRec = recordDeviceFailure(event)
    if (devRec.count === MAX_ATTEMPTS) try { await notifyLockout({ site: 'content-factory', account, event, reason: 'per-device limit' }) } catch {}
  }
  return attempts
}

function issueSession(account, event) {
  const userAgent = String(event.headers?.['user-agent'] || '')
  const payload = Buffer.from(JSON.stringify({
    sub: account.id,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    ua: sha256(userAgent).slice(0, 24),
  })).toString('base64url')
  return `${payload}.${sign(payload, 'session')}`
}

async function recordSuccess(account, pin, event) {
  try {
    await updateAccount(account.id, {
      'Failed Login Attempts': 0,
      'Failed Window Started': null,
      'Locked Until': null,
      'Last Login': new Date().toISOString(),
    })
  } catch {}
  if (event) resetIpDeviceOnSuccess(event)
  return issueSession(account, event)
}

function parseCookies(event) {
  const raw = event.headers?.cookie || event.headers?.Cookie || ''
  return Object.fromEntries(raw.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=')
    if (index < 0) return [part, '']
    return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))]
  }))
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
}

function verifySessionToken(token, event) {
  const [payload, signature] = String(token || '').split('.')
  if (!payload || !signature || !safeEqual(signature, sign(payload, 'session'))) return null
  let data
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { return null }
  if (!data?.sub || Number(data.exp || 0) <= Math.floor(Date.now() / 1000)) return null
  const userAgent = String(event.headers?.['user-agent'] || '')
  return data.ua === sha256(userAgent).slice(0, 24) ? data : null
}

function makeCaptchaQuestion() {
  if (crypto.randomInt(0, 2) === 0) {
    const add = crypto.randomInt(0, 2) === 0
    const a = crypto.randomInt(3, 20)
    const b = crypto.randomInt(1, 10)
    const left = add ? a : Math.max(a, b)
    const right = add ? b : Math.min(a, b)
    return { question: `What is ${left} ${add ? '+' : '-'} ${right}?`, answer: String(add ? left + right : left - right) }
  }
  const words = ['red', 'black', 'silver', 'gold', 'blue', 'white']
  const word = words[crypto.randomInt(0, words.length)]
  return { question: `Type "${word}" backwards.`, answer: word.split('').reverse().join('') }
}

function issueCaptcha() {
  const challenge = makeCaptchaQuestion()
  const nonce = crypto.randomBytes(16).toString('base64url')
  const normalizedAnswer = challenge.answer.trim().toLowerCase()
  const payload = Buffer.from(JSON.stringify({
    nonce,
    exp: Math.floor(Date.now() / 1000) + CAPTCHA_TTL_SECONDS,
    answer: sign(`${nonce}:${normalizedAnswer}`, 'captcha-answer'),
  })).toString('base64url')
  return { question: challenge.question, captchaToken: `${payload}.${sign(payload, 'captcha-token')}`, expiresIn: CAPTCHA_TTL_SECONDS }
}

function verifyCaptcha(captchaToken, answer) {
  const [payload, signature] = String(captchaToken || '').split('.')
  if (!payload || !signature || !safeEqual(signature, sign(payload, 'captcha-token'))) return false
  let data
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { return false }
  if (!data?.nonce || !data?.answer || Number(data.exp || 0) <= Math.floor(Date.now() / 1000)) return false
  const expected = sign(`${data.nonce}:${String(answer || '').trim().toLowerCase()}`, 'captcha-answer')
  return safeEqual(expected, data.answer)
}

async function requireAccount(event, { requireProviderSetup = true } = {}) {
  const token = parseCookies(event)[SESSION_COOKIE]
  const session = verifySessionToken(token, event)
  if (!session) return { error: { statusCode: 401, body: { error: 'AUTH_REQUIRED' } } }

  let account
  try {
    account = await getAccount(session.sub)
  } catch (error) {
    return { error: { statusCode: 503, body: { error: 'AIRTABLE_UNAVAILABLE', detail: error.message } } }
  }
  if (!account || !isActive(account)) return { error: { statusCode: 401, body: { error: 'AUTH_REQUIRED' } } }
  if (requireProviderSetup && !account.fields['Provider Setup Complete']) {
    return { error: { statusCode: 403, body: { error: 'PROVIDER_SETUP_REQUIRED' } }, account }
  }
  return { account, session }
}

function accountProviderKeys(account) {
  return {
    kie: String(account?.fields?.['Kie API Key'] || ''),
    fal: String(account?.fields?.['fal API Key'] || ''),
  }
}

module.exports = {
  SESSION_COOKIE,
  MAX_ATTEMPTS,
  LOCK_MINUTES,
  WINDOW_MS,
  getClientIp,
  getDeviceId,
  checkIpLimit,
  checkDeviceLimit,
  findAccountByName,
  getAccount,
  updateAccount,
  isActive,
  lockedUntil,
  pinMatches,
  recordFailure,
  recordSuccess,
  issueSession,
  parseCookies,
  sessionCookie,
  clearSessionCookie,
  requireAccount,
  accountProviderKeys,
  issueCaptcha,
  verifyCaptcha,
}