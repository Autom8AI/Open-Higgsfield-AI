const { json, denied, guard } = require('./_kie')
const { requireFalKey, submit } = require('./_fal')
const { listRecords } = require('./_airtable')

const TABLE = 'tblsT27uHkU21Csq0'

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipStored(files) {
  const local = [], central = []
  let offset = 0
  files.forEach((file, index) => {
    const name = Buffer.from(file.name || `avatar-${index + 1}.jpg`)
    const data = file.data
    const crc = crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8)
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12); lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28)
    local.push(lh, name, data)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10)
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20)
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32)
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42)
    central.push(ch, name)
    offset += lh.length + name.length + data.length
  })
  const centralBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20)
  return Buffer.concat([...local, centralBuffer, end])
}

function triggerFor(name) {
  const clean = String(name || 'avatar').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'avatar'
  return `matai_${clean}`
}

exports.handler = guard('avatar-train', async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true })
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })
  const gate = denied(event); if (gate) return gate
  const env = requireFalKey(json); if (env) return env

  const body = JSON.parse(event.body || '{}')
  if (!body.avatarId) return json(400, { error: 'avatarId is required.' })
  const records = await listRecords(TABLE, { max: 100 })
  const record = records.find((r) => r.id === body.avatarId)
  if (!record) return json(404, { error: 'Avatar not found.' })
  const portraits = record.fields?.Portraits || []
  if (portraits.length < 4) return json(400, { error: 'Upload at least 4 clear avatar reference images before training.' })

  const files = []
  for (let i = 0; i < portraits.length; i++) {
    const res = await fetch(portraits[i].url)
    if (!res.ok) throw new Error(`Could not download portrait ${i + 1}`)
    files.push({ name: `portrait-${i + 1}.jpg`, data: Buffer.from(await res.arrayBuffer()) })
  }
  const zip = zipStored(files)
  const imagesDataUrl = `data:application/zip;base64,${zip.toString('base64')}`
  const triggerWord = triggerFor(record.fields?.Name)
  const requestId = await submit('fal-ai/flux-lora-fast-training', {
    images_data_url: imagesDataUrl,
    trigger_word: triggerWord,
    is_style: false,
  })

  return json(200, {
    ok: true,
    taskId: `fal:${encodeURIComponent('fal-ai/flux-lora-fast-training')}:${requestId}`,
    requestId,
    triggerWord,
    avatarId: body.avatarId,
    age: body.age || null,
    heightCm: body.heightCm || null,
    estimatedCredits: 200,
  })
})
