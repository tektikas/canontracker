// Book export probe: node scripts/export-probe.mjs <baseUrl>   (needs xmllint and unzip on PATH)
// Repros: (1) a control char in a document must not make the EPUB XHTML invalid XML; (2) a cover only comes from documents inside the export's scope.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
const ok = label => console.log(`ok  ${label}`)
let cookie = ''
const api = async (path, { method = 'GET', body, form } = {}) => {
  const res = await fetch(base + path, { method, headers: form ? { cookie } : { 'content-type': 'application/json', cookie }, body: form ?? (body && JSON.stringify(body)) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const buf = Buffer.from(await res.arrayBuffer())
  let data = buf
  try { data = JSON.parse(buf.toString()) } catch {}
  return { status: res.status, data, buf }
}
assert.equal((await api('/api/auth/signup', { method: 'POST', body: { name: `Eve ${run}`, email: `eve-${run}@probe.test`, password: 'correct horse' } })).status, 200)
const studio = (await api('/api/studios', { method: 'POST', body: { name: `Press ${run}` } })).data
await api('/api/projects', { method: 'POST', body: { name: 'Broken Tide', studio_id: studio.id } })
assert.equal((await api('/api/demo/load', { method: 'POST' })).status, 200)

// A document with a forbidden control char, a lone surrogate and an XML-special title.
const text = `# Ctl <&> "doc" ${run}\n\nBell\u0001char, null\u0000, FFFE￾, lone \uD800 surrogate, tab\tok & <tag>.\n`
const f = new FormData()
f.append('files', new Blob([text], { type: 'text/markdown' }), `ctl-${run}.md`)
const imp = (await api('/api/documents', { method: 'POST', form: f })).data.results[0]
assert.ok(imp.id || imp.status !== 'error', JSON.stringify(imp))
const docs = (await api('/api/documents')).data
const doc = docs.find(d => d.filename === `ctl-${run}.md`)
assert.ok(doc, 'document imported')
ok('imported a document with control characters')

// Real PNG as the document's cover.
const png = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA6300010000050001A5F645400000000049454E44AE426082', 'hex')
const img = new FormData()
img.append('target_type', 'document'); img.append('target_id', doc.id)
img.append('files', new Blob([png], { type: 'image/png' }), 'cover.png')
const up = await api('/api/images/upload', { method: 'POST', form: img })
assert.equal(up.status, 200, JSON.stringify(up.data))
const row = up.data.results[0]
assert.equal((await api(`/api/images/${row.id ?? row.image?.id}/apply`, { method: 'POST' })).status, 200)
ok('document cover applied')

// 1. Every XHTML/OPF file of both EPUBs parses as XML.
const dir = mkdtempSync(join(tmpdir(), 'epub-'))
for (const [label, q] of [['manuscript', 'book=manuscript&format=epub'], ['bible', 'book=bible&format=epub']]) {
  const r = await api(`/api/export/bible?${q}`)
  assert.equal(r.status, 200, label)
  const p = join(dir, `${label}.epub`)
  writeFileSync(p, r.buf)
  assert.match(execFileSync('unzip', ['-p', p, 'OEBPS/front.xhtml']).toString(), /Made with CanonTracker/, `${label} has the current product attribution`)
  const names = execFileSync('unzip', ['-Z1', p]).toString().trim().split('\n').filter(n => /\.(xhtml|opf|xml)$/.test(n))
  for (const n of names) execFileSync('xmllint', ['--noout', '-'], { input: execFileSync('unzip', ['-p', p, n]), stdio: ['pipe', 'pipe', 'pipe'] })
  ok(`${label} EPUB: ${names.length} XML files are well-formed`)
}

// 2. Cover scope: whole manuscript has the cover; a bible scoped to an unrelated entity must not.
assert.ok((await api('/api/export/bible?book=manuscript&format=json')).data.cover, 'whole manuscript has a cover')
ok('manuscript cover present')
const empty = (await api('/api/entities', { method: 'POST', body: { name: `Nobody ${run}`, kind: 'character' } })).data
const scoped = `scope=entities&entity_ids=${empty.id}`
assert.equal((await api(`/api/export/bible?book=bible&format=json&${scoped}`)).data.cover, null)
const ep = join(dir, 'scoped.epub')
writeFileSync(ep, (await api(`/api/export/bible?book=bible&format=epub&${scoped}`)).buf)
assert.ok(!execFileSync('unzip', ['-Z1', ep]).toString().includes('cover'), 'no cover in scoped EPUB')
ok('scoped bible: typographic cover only (print JSON and EPUB)')
