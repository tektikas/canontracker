// Image upload probe. Two modes:
//   node scripts/image-upload-probe.mjs [baseUrl]   against a running server (mock mode is fine: uploads never need the model)
//     For a localhost server it also finds the server's PID (ss -ltnp) and checks its memory stays flat on a 90 MB request.
//   node scripts/image-upload-probe.mjs migrate [port]
//     builds a schema-12 database (the shape at commit c7da54d) with a portrait uploaded the old way, starts the built server
//     (.output, run `pnpm build` first) on it in a temp folder on [port] (default 3999), and checks the upgrade kept that
//     portrait in use as an upload in the image history. The first boot fails the upgrade on purpose (portrait folder
//     read-only): the database must stay v12 and the next request must retry. Needs the port free; stops its server and
//     removes the folder.
// Throwaway accounts with unique emails per run; nothing outside them is touched.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = Date.now().toString(36)
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label} (${JSON.stringify(actual)})`) }

// Real, decodable test images. PNG is built here (any size); the others are tiny files made with ImageMagick.
function png(w, h, rgb = [58, 110, 165]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())])
  return Buffer.concat([Buffer.from('89504E470D0A1A0A', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))])
}
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAADAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJwBUc//2Q==', 'base64')
const GIF = Buffer.from('R0lGODlhBAADAPAAAKU6OgAAACH5BAAAAAAALAAAAAAEAAMAAAIDhI9WADs=', 'base64')
const WEBP_LOSSLESS = Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvA4AAAAfQ0upUq/+BiOh/AAA=', 'base64')
const WEBP_LOSSY = Buffer.from('UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoEAAMAAsBMJaACdAAAAADsj8KxTri5siKP+4/sj+cp0AAA', 'base64')
// Hand-built GIF: canvas cw × ch, one image descriptor per [w, h] frame. Each frame's data is one decodable 1×1 LZW
// stream; for frames bigger than that the bytes are short, which is fine: the sizes in the descriptors are what's checked.
function gif(cw, ch, frames) {
  const u16 = (n) => [n & 0xFF, n >> 8]
  const head = [...Buffer.from('GIF89a'), ...u16(cw), ...u16(ch), 0x80, 0, 0, 0, 0, 0, 0xFF, 0xFF, 0xFF]
  const body = frames.flatMap(([w, h]) => [0x21, 0xF9, 4, 0, 10, 0, 0, 0, 0x2C, 0, 0, 0, 0, ...u16(w), ...u16(h), 0, 2, 2, 0x44, 0x01, 0])
  return Buffer.from([...head, ...body, 0x3B])
}
// Hand-built animated WebP: VP8X canvas, ANIM, then one ANMF frame per [w, h] wrapping the lossless 1×1 bitstream.
function animWebp(cw, ch, frames) {
  const u24 = (n) => [n & 0xFF, (n >> 8) & 0xFF, n >> 16]
  const chunk = (id, data) => { const len = Buffer.alloc(4); len.writeUInt32LE(data.length); return Buffer.concat([Buffer.from(id, 'ascii'), len, data, Buffer.alloc(data.length & 1)]) }
  const vp8l = WEBP_LOSSLESS.subarray(12)
  const body = Buffer.concat([
    chunk('VP8X', Buffer.from([0x02, 0, 0, 0, ...u24(cw - 1), ...u24(ch - 1)])), chunk('ANIM', Buffer.alloc(6)),
    ...frames.map(([w, h]) => chunk('ANMF', Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 0, ...u24(w - 1), ...u24(h - 1), 100, 0, 0, 0]), vp8l])))])
  const size = Buffer.alloc(4); size.writeUInt32LE(body.length + 4)
  return Buffer.concat([Buffer.from('RIFF'), size, Buffer.from('WEBP'), body])
}
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>')

function client(base) {
  let cookie = ''
  const c = async (path, { method = 'GET', body, form, raw } = {}) => {
    const headers = form ? { cookie } : { 'content-type': 'application/json', cookie }
    const res = await fetch(base + path, { method, headers, body: form ?? (body && JSON.stringify(body)) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    if (raw) return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type'), headers: res.headers }
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
  c.cookie = () => cookie
  return c
}
const files = (target, list, extra = {}) => {
  const f = new FormData()
  f.append('target_type', target.type)
  f.append('target_id', target.id)
  for (const [k, v] of Object.entries(extra)) f.append(k, v)
  for (const [name, bytes, type] of list) f.append('files', new Blob([bytes], { type }), name)
  return f
}

if (process.argv[2] === 'migrate') await migrate(Number(process.argv[3] ?? 3999))
else await live(process.argv[2] ?? 'http://localhost:3000')

async function live(base) {
  const account = async (name) => {
    const c = client(base)
    const r = await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })
    assert.equal(r.status, 200, `signup ${name}: ${JSON.stringify(r.data)}`)
    return c
  }
  const a = await account('Ada')
  const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Tidewright' } })).data
  await a('/api/projects', { method: 'POST', body: { name: 'Broken Tide', studio_id: studio.id } })
  check('A loads the demo', (await a('/api/demo/load', { method: 'POST' })).status, 200)
  const leya = (await a('/api/entities', { method: 'POST', body: { name: `Leya ${run}`, kind: 'character' } })).data
  const dup = (await a('/api/entities', { method: 'POST', body: { name: `Leya Dup ${run}`, kind: 'character' } })).data
  const doc = (await a('/api/documents')).data[0]
  const L = { type: 'entity', id: leya.id }
  const list = async (t = L) => (await a(`/api/images?target_type=${t.type}&target_id=${t.id}`)).data.images

  // Multi-upload: four real images of four types in one request, none applied.
  const four = [['key-art.png', png(64, 48), 'image/png'], ['costume.jpg', JPEG, 'image/jpeg'], ['map.gif', GIF, 'image/gif'], ['sheet.webp', WEBP_LOSSY, 'image/webp']]
  const up = await a('/api/images/upload', { method: 'POST', form: files(L, four, { caption: 'Act 1 look' }) })
  check('multi-upload adds 4 images', [up.status, up.data.results.map(r => r.status)], [200, ['added', 'added', 'added', 'added']])
  check('nothing applied by a gallery upload', [up.data.applied, (await a(`/api/entities/${leya.id}`)).data.portrait], [null, null])
  const imgs = await list()
  check('history lists them as uploads with name, author and caption', imgs.map(i => [i.source, i.filename, i.created_by_name, i.caption]).sort(),
    four.map(([n]) => ['upload', n, 'Ada', 'Act 1 look']).sort())
  check('stored type comes from the bytes', imgs.map(i => i.mime).sort(), ['image/gif', 'image/jpeg', 'image/png', 'image/webp'])
  const pngRow = imgs.find(i => i.filename === 'key-art.png')
  const served = await a(`/api/images/${pngRow.id}`, { raw: true })
  check('uploaded bytes served unchanged', [served.status, served.type, served.bytes.equals(four[0][1])], [200, 'image/png', true])
  check('inline view: no download header, nosniff', [served.headers.get('content-disposition'), served.headers.get('x-content-type-options')], [null, 'nosniff'])
  const dl = await a(`/api/images/${pngRow.id}?download=1`, { raw: true })
  check('?download=1 saves it under its own name', [dl.status, dl.headers.get('content-disposition'), dl.bytes.equals(four[0][1])],
    [200, `attachment; filename="key-art.png"; filename*=UTF-8''key-art.png`, true])
  const ev = (await a('/api/audit')).data.find(x => x.event_type === 'image.uploaded' && x.target_id === leya.id)
  check('one audit event for the batch: “uploaded 4 images”', [ev?.detail.images.length, ev?.detail.name], [4, `Leya ${run}`])

  // Refused by bytes, size and pixels, each on its own; the good file in the same batch still lands.
  const big = Buffer.concat([png(8, 8), Buffer.alloc(10_000_001 - png(8, 8).length)])
  const bomb = png(1, 1); bomb.writeUInt32BE(20_000, 16); bomb.writeUInt32BE(20_000, 20)
  const mixed = await a('/api/images/upload', { method: 'POST', form: files(L, [
    ['logo.svg', SVG, 'image/svg+xml'], ['fake.png', Buffer.from('just text, renamed to .png'), 'image/png'], ['huge.png', big, 'image/png'],
    ['bomb.png', bomb, 'image/png'], ['lossless.webp', WEBP_LOSSLESS, 'image/webp']]) })
  check('mixed batch: per-file results', mixed.data.results.map(r => [r.name, r.status]),
    [['logo.svg', 'refused'], ['fake.png', 'refused'], ['huge.png', 'refused'], ['bomb.png', 'refused'], ['lossless.webp', 'added']])
  check('SVG and a renamed text file refused by their contents', mixed.data.results.slice(0, 2).every(r => /judged by its contents/.test(r.message)), true)
  check('over 10 MB refused', /Too large/.test(mixed.data.results[2].message), true)
  check('20000 × 20000 refused by pixels', /Too many pixels \(20000 × 20000\)/.test(mixed.data.results[3].message), true)
  check('refused files leave no row', (await list()).length, 5)
  check('more than 8 files in one request refused', (await a('/api/images/upload', { method: 'POST', form: files(L, Array.from({ length: 9 }, (_, i) => [`${i}.gif`, GIF, 'image/gif'])) })).status, 400)
  check('upload without files refused', (await a('/api/images/upload', { method: 'POST', form: files(L, []) })).status, 400)

  // Hostile files, judged on their whole structure: frame sizes, animation budgets, files cut short.
  const reasons = async (list) => (await a('/api/images/upload', { method: 'POST', form: files(L, list) })).data.results.map(r => [r.name, r.status === 'added' ? 'added' : r.message.split(/[:(]/)[0].trim()])
  const pngCut = png(4, 4).subarray(0, 24)
  check('hostile structures refused, real animations kept', await reasons([
    ['tiny-canvas-wide-frame.gif', gif(1, 1, [[13_001, 1]]), 'image/gif'],
    ['too-many-frames.gif', gif(1, 1, Array.from({ length: 1001 }, () => [1, 1])), 'image/gif'],
    ['too-many-pixels.gif', gif(1000, 1000, Array.from({ length: 51 }, () => [1000, 1000])), 'image/gif'],
    ['cut.gif', GIF.subarray(0, GIF.length - 8), 'image/gif'],
    ['cut.png', pngCut, 'image/png'],
    ['cut.webp', WEBP_LOSSY.subarray(0, 30), 'image/webp'],
    ['tiny-canvas-wide-frame.webp', animWebp(1, 1, [[13_001, 1]]), 'image/webp'],
    ['blink.gif', gif(1, 1, [[1, 1], [1, 1]]), 'image/gif'],
  ]), [
    ['tiny-canvas-wide-frame.gif', 'Too many pixels'], ['too-many-frames.gif', 'Too much animation'], ['too-many-pixels.gif', 'Too much animation'],
    ['cut.gif', 'This image looks damaged'], ['cut.png', 'This image looks damaged'], ['cut.webp', 'This image looks damaged'],
    ['tiny-canvas-wide-frame.webp', 'Too many pixels'], ['blink.gif', 'added'],
  ])
  check('…and an animated WebP within the limits is kept', await reasons([['blink.webp', animWebp(1, 1, [[1, 1], [1, 1]]), 'image/webp']]), [['blink.webp', 'added']])
  const blink = (await list()).filter(i => /^blink\./.test(i.filename))
  for (const i of blink) await a(`/api/images/${i.id}`, { method: 'DELETE' })

  // Hostile requests: the body is capped while it streams, before any parsing.
  // A chunked body (no Content-Length) with a 90 MB field nobody reads, then one real image.
  const pidOf = (port) => { try { return execFileSync('ss', ['-ltnpH', `sport = :${port}`], { encoding: 'utf8' }).match(/pid=(\d+)/)?.[1] } catch {} }
  const rss = (pid) => Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) / 1024
  const pid = /localhost|127\.0\.0\.1/.test(base) ? pidOf(new URL(base).port) : undefined
  const rssBefore = pid && rss(pid)
  // Streams the parts one chunk at a time with no Content-Length (chunked); a function part is a generator of chunks.
  const chunked = async (parts, path = '/api/images/upload') => {
    const it = (function* () { for (const p of parts) typeof p === 'function' ? yield* p() : yield p })()
    const body = new ReadableStream({ pull(c) { const { value, done } = it.next(); done ? c.close() : c.enqueue(value) } })
    const res = await fetch(`${base}${path}`, { method: 'POST', duplex: 'half', body, headers: { 'content-type': `multipart/form-data; boundary=${bnd}`, cookie: a.cookie() } })
      .catch(e => ({ status: `error: ${e.cause?.code ?? e.message}` }))
    return res.status
  }
  // Declares 90 MB, sends a few bytes and waits: the answer must come from the header alone.
  const declared = () => new Promise((resolve) => {
    const req = request(`${base}/api/images/upload`, { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${bnd}`, 'content-length': '90000000', cookie: a.cookie() } },
      (res) => { resolve(res.statusCode); res.resume(); req.destroy() })
    req.on('error', e => resolve(`error: ${e.code}`))
    req.write('--' + bnd)
  })
  const bnd = `----probe${run}`
  const field = (name, value) => Buffer.from(`--${bnd}\r\ncontent-disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
  const file = (name, bytes) => Buffer.concat([Buffer.from(`--${bnd}\r\ncontent-disposition: form-data; name="files"; filename="${name}"\r\ncontent-type: image/png\r\n\r\n`), bytes, Buffer.from('\r\n')])
  const mb = Buffer.alloc(1_000_000, 0x61)
  const rowsBefore = (await list()).length
  check('chunked body with a 90 MB ignored field: 413', await chunked([field('target_type', 'entity'), field('target_id', leya.id),
    Buffer.from(`--${bnd}\r\ncontent-disposition: form-data; name="ignored"\r\n\r\n`), function* () { for (let i = 0; i < 90; i++) yield mb }, Buffer.from('\r\n'),
    file('x.png', png(2, 2)), Buffer.from(`--${bnd}--\r\n`)]), 413)
  if (pid) {
    const grew = rss(pid) - rssBefore
    check(`server memory stays flat (grew ${grew.toFixed(0)} MiB, under 40)`, grew < 40, true)
  } else console.log('skip memory check: no local server PID found')
  check('chunked body with 30 fields: 413', await chunked([field('target_type', 'entity'), field('target_id', leya.id),
    ...Array.from({ length: 30 }, (_, i) => field(`f${i}`, 'x')), file('x.png', png(2, 2)), Buffer.from(`--${bnd}--\r\n`)]), 413)
  check('a 5 KB text field: 413', await chunked([field('target_type', 'entity'), field('target_id', leya.id), field('caption', 'x'.repeat(5000)),
    file('x.png', png(2, 2)), Buffer.from(`--${bnd}--\r\n`)]), 413)
  // Library import goes through the same limiter: a 90 MB ignored field + a small .md is refused, memory flat.
  const mdFile = Buffer.from(`--${bnd}\r\ncontent-disposition: form-data; name="files"; filename="n.md"\r\n\r\n# N\r\n`)
  const docsBefore = (await a('/api/documents')).data.length
  const rss2 = pid && rss(pid)
  check('library import, chunked 90 MB ignored field: 413', await chunked([
    Buffer.from(`--${bnd}\r\ncontent-disposition: form-data; name="ignored"\r\n\r\n`), function* () { for (let i = 0; i < 90; i++) yield mb }, Buffer.from('\r\n'),
    mdFile, Buffer.from(`--${bnd}--\r\n`)], '/api/documents'), 413)
  if (pid) { const grew = rss(pid) - rss2; check(`library import memory stays flat (grew ${grew.toFixed(0)} MiB, under 40)`, grew < 40, true) }
  check('library import with 30 fields: 413', await chunked([...Array.from({ length: 30 }, (_, i) => field(`f${i}`, 'x')), mdFile, Buffer.from(`--${bnd}--\r\n`)], '/api/documents'), 413)
  check('refused imports add no document', (await a('/api/documents')).data.length, docsBefore)
  check('Content-Length over the cap: 413 before reading', await declared(), 413)
  check('refused requests add nothing', (await list()).length, rowsBefore)
  check('a well-formed chunked upload still works', await chunked([field('target_type', 'entity'), field('target_id', leya.id),
    file('chunked.png', png(3, 3)), Buffer.from(`--${bnd}--\r\n`)]), 200)
  for (const i of (await list()).filter(i => i.filename === 'chunked.png')) await a(`/api/images/${i.id}`, { method: 'DELETE' })

  // Set an upload as the portrait; captions; delete with the in-use guard.
  check('set an uploaded image as portrait', (await a(`/api/images/${pngRow.id}/apply`, { method: 'POST' })).status, 200)
  const page = (await a(`/api/entities/${leya.id}`)).data
  check('portrait label says uploaded, by whom', [page.portrait_image?.id, page.portrait_image?.source, page.portrait_image?.created_by_name], [pngRow.id, 'upload', 'Ada'])
  check('portrait served from the upload', (await a(page.portrait, { raw: true })).bytes.equals(four[0][1]), true)
  const appliedEv = (await a('/api/audit')).data.find(x => x.event_type === 'image.applied' && x.target_id === leya.id)
  check('audit: set an uploaded image as portrait', [appliedEv?.detail.source, appliedEv?.detail.as], ['upload', 'portrait'])
  check('caption edit', (await a(`/api/images/${pngRow.id}`, { method: 'PATCH', body: { caption: 'Final key art' } })).data.caption, 'Final key art')
  check('caption too long refused', (await a(`/api/images/${pngRow.id}`, { method: 'PATCH', body: { caption: 'x'.repeat(301) } })).status, 400)
  check('in-use image cannot be deleted', (await a(`/api/images/${pngRow.id}`, { method: 'DELETE' })).status, 409)
  const gifRow = imgs.find(i => i.filename === 'map.gif')
  check('delete an uploaded image', (await a(`/api/images/${gifRow.id}`, { method: 'DELETE' })).status, 200)
  check('its file is gone', (await a(`/api/images/${gifRow.id}`, { raw: true })).status, 404)
  check('audit: deleted an uploaded image', (await a('/api/audit')).data.find(x => x.event_type === 'image.discarded')?.detail.source, 'upload')

  // Removing the portrait keeps the image (undo = apply again).
  await a(`/api/entities/${leya.id}/portrait`, { method: 'DELETE' })
  check('removed portrait stays in the history, not in use', (await list()).find(i => i.id === pngRow.id)?.applied, false)
  check('undo: apply it again', (await a(`/api/images/${pngRow.id}/apply`, { method: 'POST' })).status, 200)

  // Upload onto the empty slot sets it directly; the old single-portrait route lands in the history too.
  const D = { type: 'entity', id: dup.id }
  const slot = await a('/api/images/upload', { method: 'POST', form: files(D, [['dup-face.jpg', JPEG, 'image/jpeg']], { apply: '1' }) })
  check('upload onto the empty portrait slot sets it', [slot.data.results[0].status, slot.data.applied === slot.data.results[0].image.id], ['added', true])
  const f = new FormData(); f.append('file', new Blob([png(10, 10, [200, 30, 30])], { type: 'image/png' }), 'replace.png')
  check('portrait route still uploads', (await a(`/api/entities/${dup.id}/portrait`, { method: 'POST', form: f })).status, 200)
  const dupImgs = await list(D)
  check('…and keeps both in the history, the newest in use', [dupImgs.length, dupImgs.find(i => i.applied)?.filename], [2, 'replace.png'])
  const svgPortrait = new FormData(); svgPortrait.append('file', new Blob([SVG], { type: 'image/svg+xml' }), 'x.svg')
  check('portrait route refuses SVG', (await a(`/api/entities/${dup.id}/portrait`, { method: 'POST', form: svgPortrait })).status, 415)

  // Document cover upload.
  const C = { type: 'document', id: doc.id }
  const cov = await a('/api/images/upload', { method: 'POST', form: files(C, [['cover.png', png(80, 45), 'image/png']], { apply: '1' }) })
  check('cover upload', cov.data.results[0].status, 'added')
  const d = (await a(`/api/documents/${doc.id}`)).data
  check('document cover is the upload', [d.cover?.source, d.cover?.filename], ['upload', 'cover.png'])

  // Merge: uploaded images (and the discarded portrait) move to the kept page; the preview counts them.
  const preview = (await a(`/api/entities/${dup.id}/merge`, { method: 'POST', body: { into: leya.id, preview: true } })).data
  check('merge preview counts uploaded images', [preview.images_moved, preview.portrait], [2, 'discard'])
  check('preview moves nothing', (await list(D)).length, 2)
  const before = (await list()).length
  check('merge', (await a(`/api/entities/${dup.id}/merge`, { method: 'POST', body: { into: leya.id } })).status, 200)
  const after = await list()
  check('uploaded images moved, kept portrait unchanged', [after.length, after.find(i => i.applied)?.id], [before + 2, pngRow.id])
  check('moved upload still served', (await a(`/api/images/${dupImgs[0].id}`, { raw: true })).status, 200)

  // Another studio: 404 on everything of A's; a viewer: may look, may not upload.
  const b = await account('Bo')
  const sb = (await b('/api/studios', { method: 'POST', body: { name: 'Other Studio' } })).data
  await b('/api/projects', { method: 'POST', body: { name: 'Other Game', studio_id: sb.id } })
  check('B gets 404 on A’s uploaded image', (await b(`/api/images/${pngRow.id}`)).status, 404)
  check('B gets 404 uploading to A’s entity', (await b('/api/images/upload', { method: 'POST', form: files(L, [['x.png', png(2, 2), 'image/png']]) })).status, 404)
  check('B gets 404 captioning A’s image', (await b(`/api/images/${pngRow.id}`, { method: 'PATCH', body: { caption: 'x' } })).status, 404)
  check('B gets 404 applying A’s upload', (await b(`/api/images/${dupImgs[0].id}/apply`, { method: 'POST' })).status, 404)
  check('B gets 404 deleting A’s upload', (await b(`/api/images/${dupImgs[0].id}`, { method: 'DELETE' })).status, 404)
  const link = (await a('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 1 } })).data
  const v = await account('Vee')
  await v(`/api/invites/${link.token}/accept`, { method: 'POST' })
  check('viewer can see an uploaded image', (await v(`/api/images/${pngRow.id}`)).status, 200)
  check('viewer gets 403 uploading', (await v('/api/images/upload', { method: 'POST', form: files(L, [['x.png', png(2, 2), 'image/png']]) })).status, 403)
  check('viewer gets 403 captioning', (await v(`/api/images/${pngRow.id}`, { method: 'PATCH', body: { caption: 'x' } })).status, 403)
  check('viewer gets 403 deleting', (await v(`/api/images/${dupImgs[0].id}`, { method: 'DELETE' })).status, 403)
  check('images are not canon: no fact mentions an upload', (await a('/api/facts?status=canon')).data.some(x => /key-art|\.png/.test(x.statement)), false)
  console.log('image upload probe: all checks passed')
}

async function migrate(port) {
  const dir = mkdtempSync(join(tmpdir(), 'sb-migrate-'))
  const data = join(dir, '.data')
  mkdirSync(data)
  let server
  try {
    // The schema as it was at version 12, read from history so it is the real shape.
    const old = execFileSync('git', ['show', 'c7da54d:server/utils/db.ts'], { cwd: root, encoding: 'utf8' })
    const schema = old.slice(old.indexOf('const SCHEMA = `') + 16, old.indexOf('`\n\nlet db'))
    assert.ok(/SCHEMA_VERSION = 12/.test(old) && schema.includes('create table if not exists images'), 'v12 schema found')
    const db = new DatabaseSync(join(data, 'storybible.db'))
    db.exec(schema)
    db.exec('pragma user_version = 12')
    const salt = randomBytes(16)
    const hash = `scrypt$${salt.toString('hex')}$${scryptSync('correct horse', salt, 64).toString('hex')}`
    const at = '2026-10-30T10:00:00.000Z'
    db.prepare('insert into users values (?, ?, ?, ?, ?, ?)').run('usr_m', `mig-${run}@probe.test`, 'Ada', hash, 'prj_m', at)
    db.prepare('insert into studios values (?, ?, ?, ?)').run('std_m', 'Tidewright', 'usr_m', at)
    db.prepare('insert into memberships values (?, ?, ?, ?)').run('std_m', 'usr_m', 'owner', at)
    db.prepare(`insert into projects (id, studio_id, name, created_at) values ('prj_m', 'std_m', 'Broken Tide', ?)`).run(at)
    const ent = db.prepare(`insert into entities (id, name, kind, portrait_type, portrait_at, origin, created_at, created_by, updated_at, updated_by, project_id)
      values (?, ?, 'character', ?, ?, 'manual', ?, 'usr_m', ?, 'usr_m', 'prj_m')`)
    // Leya: portrait uploaded the old way (no image row). Mira: a generated image in use (must not get a second row).
    ent.run('ent_leya', 'Leya', 'image/png', '2026-10-30T11:00:00.000Z', at, at)
    ent.run('ent_mira', 'Mira', 'image/png', '2026-10-30T12:00:00.000Z', at, at)
    db.prepare(`insert into images values ('img_gen', 'entity', 'ent_mira', 'A portrait of Mira', 'none', 'muse-image-1.0', 'image/png', 70, ?, 'usr_m', ?, 'prj_m')`).run(at, at)
    db.prepare(`insert into audit_events values ('aud_1', 'entity.portrait_set', 'entity', 'ent_leya', 'usr_m', '{"name":"Leya"}', '2026-10-30T11:00:00.000Z', 'prj_m')`).run()
    db.close()
    const portraits = join(data, 'portraits', 'prj_m')
    mkdirSync(portraits, { recursive: true })
    const leyaPng = png(12, 12, [10, 120, 60])
    writeFileSync(join(portraits, 'ent_leya'), leyaPng)
    writeFileSync(join(portraits, 'ent_mira'), png(4, 4))
    writeFileSync(join(portraits, 'img_gen'), png(4, 4))
    // First boot fails the upgrade on purpose: the portrait copy can't be written.
    chmodSync(portraits, 0o555)

    server = spawn(process.execPath, [join(root, '.output/server/index.mjs')], { cwd: dir, stdio: 'ignore',
      env: { ...process.env, PORT: String(port), HOST: 'localhost', NUXT_SESSION_PASSWORD: randomBytes(24).toString('hex'), NUXT_MODEL_MODE: 'mock' } })
    const base = `http://localhost:${port}`
    for (let i = 0; ; i++) {
      try { await fetch(`${base}/api/health`); break } catch {}
      if (i > 100) throw new Error('server did not start')
      await new Promise(r => setTimeout(r, 100))
    }
    const version = () => { const d = new DatabaseSync(join(data, 'storybible.db'), { readOnly: true }); try { return d.prepare('pragma user_version').get().user_version } finally { d.close() } }
    check('failed upgrade: health 500, and again on the next request (no half-set-up connection kept)',
      [(await fetch(`${base}/api/health`)).status, (await fetch(`${base}/api/health`)).status], [500, 500])
    check('failed upgrade: database still v12, no stray portrait copies', [version(), readdirSync(portraits).sort()], [12, ['ent_leya', 'ent_mira', 'img_gen']])
    chmodSync(portraits, 0o755)
    const h = await fetch(`${base}/api/health`)
    check('fixed: the next request upgrades without a restart; health reports the file’s version', [h.status, (await h.json()).schema, version()], [200, 14, 14])
    const c = client(base)
    check('log in to the upgraded database', (await c('/api/auth/login', { method: 'POST', body: { email: `mig-${run}@probe.test`, password: 'correct horse' } })).status, 200)
    const leya = (await c('/api/entities/ent_leya')).data
    check('old uploaded portrait is still in use, now an upload in the history', [leya.portrait_image?.source, leya.portrait_image?.created_by_name, leya.portrait_image?.created_at],
      ['upload', 'Ada', '2026-10-30T11:00:00.000Z'])
    check('portrait still served', (await c(leya.portrait, { raw: true })).bytes.equals(leyaPng), true)
    check('history row has its own copy of the bytes', (await c(`/api/images/${leya.portrait_image.id}`, { raw: true })).bytes.equals(leyaPng), true)
    const mira = (await c('/api/images?target_type=entity&target_id=ent_mira')).data.images
    check('generated portrait untouched, no duplicate row', mira.map(i => [i.id, i.source, i.applied]), [['img_gen', 'generated', true]])
    check('schema is now 14', (await c('/api/health')).data.schema, 14)
    console.log('migration probe: all checks passed')
  } finally {
    try { chmodSync(join(data, 'portraits', 'prj_m'), 0o755) } catch {}
    server?.kill()
    await new Promise(r => setTimeout(r, 300))
    rmSync(dir, { recursive: true, force: true })
  }
}
