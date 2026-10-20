// Avatar CRUD. Portraits are stored as Airtable attachments rather than on
// disk, since there is no disk here.
//
// Uploads arrive as data URLs, get hosted on kie's CDN, and Airtable then
// re-hosts them from that URL -- kie's copy expires after a few days, so the
// Airtable attachment is the durable one.

// Resolve the avatar function's Airtable credential before loading the shared
// Airtable client. Netlify projects commonly expose a PAT under
// AIRTABLE_ACCESS_TOKEN / AIRTABLE_PERSONAL_ACCESS_TOKEN while an older,
// rejected AIRTABLE_AUTH value may still exist. The previously loaded client
// always selected AIRTABLE_AUTH first, which made only this route repeatedly
// send the stale token and return 401.
const { json, denied, toHostedUrl, checkEnv, guard } = require('./_kie')
const { requireAccount, accountProviderKeys } = require('./_auth')
const { listRecords, createRecord, updateRecord, deleteRecord } = require('./_airtable')

// Use the verified table directly. A stale AIRTABLE_AVATARS_ID variable must not
// override the real table and make only the influencer page fail while the
// Generations table continues using its own correct ID.
const TABLE = 'tblsT27uHkU21Csq0'

const shape = (r) => {
  const f = r.fields || {}
  const portraits = (f.Portraits || []).map((a) => ({
    id: a.id,
    url: a.url,
    thumb: a.thumbnails?.large?.url || a.url,
  }))
  return {
    id: r.id,
    name: f.Name || 'Untitled',
    description: f.Description || '',
    voice: f.Voice || '',
    portraits,
    createdAt: f.Created || r.createdTime,
  }
}

exports.handler = guard('avatars', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  const gate = denied(event); if (gate) return gate

  const q = event.queryStringParameters || {}

  if (event.httpMethod === 'GET') {
    try {
      const records = await listRecords(TABLE, { sortField: 'Created', max: 100 })
      return json(200, { ok: true, items: records.map(shape), storage: 'airtable' })
    } catch (error) {
      // Match the image editor/library resilience pattern: a runtime Airtable
      // rejection must not blank the page. The browser merges its persistent
      // local avatar store and keeps the influencer workflow available.
      return json(200, {
        ok: true,
        items: [],
        storage: 'direct',
        storageWarning: `Airtable avatar storage unavailable: ${error.message}`,
      })
    }
  }

  if (event.httpMethod === 'DELETE') {
    if (!q.id) return json(400, { error: 'id required' })
    try {
      await deleteRecord(TABLE, q.id)
      return json(200, { ok: true, storage: 'airtable' })
    } catch (error) {
      return json(503, { error: `Avatar storage is unavailable: ${error.message}` })
    }
  }

  const b = JSON.parse(event.body || '{}')

  // Add portraits to an existing avatar, from uploads or another avatar.
  if (q.id) {
    const records = await listRecords(TABLE, { max: 100 })
    const me = records.find((r) => r.id === q.id)
    if (!me) return json(404, { error: 'No such avatar.' })
    const existing = me.fields.Portraits || []

    let incoming = []
    if (b.fromAvatar) {
      if (b.fromAvatar === q.id) return json(400, { error: 'Cannot copy an avatar into itself.' })
      const src = records.find((r) => r.id === b.fromAvatar)
      if (!src) return json(400, { error: 'No such source avatar.' })
      incoming = (src.fields.Portraits || []).map((a) => ({ url: a.url, filename: a.filename }))
    } else {
        const auth = await requireAccount(event, { requireProviderSetup: false })
        if (auth.error) return json(auth.error.statusCode, auth.error.body)
        const kieKey = accountProviderKeys(auth.account).kie
        if (!kieKey) return json(403, { error: 'KIE_KEY_REQUIRED' })
      const env = checkEnv({ airtable: false }); if (env) return env
      const hosted = []
      for (let i = 0; i < (b.images || []).length; i++) {
        hosted.push(await toHostedUrl(b.images[i], i, kieKey))
      }
      incoming = hosted.map((url, i) => ({ url, filename: `portrait-${Date.now()}-${i}.png` }))
    }
    if (!incoming.length) return json(400, { error: 'Nothing to add.' })

    const merged = [...existing.map((a) => ({ url: a.url, filename: a.filename })), ...incoming]
    const rec = await updateRecord(TABLE, q.id, { Portraits: merged })
    return json(200, { ok: true, avatar: shape(rec), storage: 'airtable' })
  }

  // Remove a single portrait, keeping at least one.
  if (q.removePortrait && q.avatar) {
    const records = await listRecords(TABLE, { max: 100 })
    const me = records.find((r) => r.id === q.avatar)
    if (!me) return json(404, { error: 'No such avatar.' })
    const kept = (me.fields.Portraits || []).filter((a) => a.id !== q.removePortrait)
    if (!kept.length) return json(400, { error: 'An avatar needs at least one portrait.' })
    const rec = await updateRecord(TABLE, q.avatar, {
      Portraits: kept.map((a) => ({ url: a.url, filename: a.filename })),
    })
    return json(200, { ok: true, avatar: shape(rec), storage: 'airtable' })
  }

  // Create.
  if (!b.name) return json(400, { error: 'Name is required.' })
  let portraits = []
  if (b.fromAvatar) {
    const records = await listRecords(TABLE, { max: 100 })
    const src = records.find((r) => r.id === b.fromAvatar)
    if (!src) return json(400, { error: 'No such source avatar.' })
    portraits = (src.fields.Portraits || []).map((a) => ({ url: a.url, filename: a.filename }))
  }

  if ((b.images || []).length) {
    const auth = await requireAccount(event, { requireProviderSetup: false })
    if (auth.error) return json(auth.error.statusCode, auth.error.body)
    var createKieKey = accountProviderKeys(auth.account).kie
    if (!createKieKey) return json(403, { error: 'KIE_KEY_REQUIRED' })
    const env = checkEnv({ airtable: false }); if (env) return env
  }
  for (let i = 0; i < (b.images || []).length; i++) {
    const url = await toHostedUrl(b.images[i], i, createKieKey)
    portraits.push({ url, filename: `portrait-${Date.now()}-${i}.png` })
  }
  if (!portraits.length) return json(400, { error: 'At least one reference portrait.' })

  const rec = await createRecord(TABLE, {
    Name: b.name,
    Description: b.description || '',
    Voice: b.voice || '',
    Portraits: portraits,
    Created: new Date().toISOString(),
  })
  return json(200, { ok: true, avatar: shape(rec), storage: 'airtable' })
})