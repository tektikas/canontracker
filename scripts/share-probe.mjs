// Story bible export + read-only share link probe: node scripts/share-probe.mjs <baseUrl> <server .data/storybible.db>
// Creates throwaway accounts (unique per run). The database is opened to check that only token hashes are stored and to
// back-date one link's expiry (the only write; nothing else in the app can make a link expire on demand).
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const base = process.argv[2] ?? 'http://localhost:3000'
const dbPath = process.argv[3]
assert.ok(dbPath, 'usage: node scripts/share-probe.mjs <baseUrl> <path to the server’s .data/storybible.db>')
const run = Date.now().toString(36)
const ok = (label, extra = '') => console.log(`ok  ${label}${extra !== '' ? ` (${extra})` : ''}`)

function client() {
  let cookie = ''
  return async (path, { method = 'GET', body, form, raw } = {}) => {
    const headers = form ? { cookie } : { 'content-type': 'application/json', cookie }
    const res = await fetch(base + path, { method, headers, body: form ?? (body && JSON.stringify(body)) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    if (raw) return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) }
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, headers: res.headers, data }
  }
}
const anon = client()
async function account(name) {
  const c = client()
  const r = await c('/api/auth/signup', { method: 'POST', body: { name: `${name} ${run}`, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })
  assert.equal(r.status, 200, `signup ${name}`)
  return c
}
const ALL = 'overview,entities,facts,timeline,rules,conflicts,sources,editorial'

// Ada: Broken Tide demo, some candidates accepted (others stay pending), a note, a portrait, an editorial summary, a scan.
const ada = await account('Ada')
const studio = (await ada('/api/studios', { method: 'POST', body: { name: `Tidewright ${run}` } })).data
await ada('/api/projects', { method: 'POST', body: { name: 'Broken Tide', studio_id: studio.id } })
assert.equal((await ada('/api/demo/load', { method: 'POST' })).status, 200)
const pending = (await ada('/api/facts?status=pending')).data
const verified = pending.filter(f => f.evidence.some(e => e.verified))
const accept = verified.slice(0, Math.max(3, verified.length - 3))
for (const f of accept) assert.equal((await ada(`/api/facts/${f.id}/review`, { method: 'POST', body: { decision: 'accept', rationale: 'probe' } })).status, 200)
const stillPending = (await ada('/api/facts?status=pending')).data
assert.ok(stillPending.length > 0, 'some candidates stay pending')
await ada('/api/conflicts/scan', { method: 'POST' })
const canon = (await ada('/api/facts?status=canon')).data
ok('setup: canon and pending', `${canon.length} canon, ${stillPending.length} pending`)

const doc = (await ada('/api/documents')).data[0]
const docFull = (await ada(`/api/documents/${doc.id}`)).data
const passage = docFull.passages[0]
const NOTE = `Secret editorial note ${run}`
assert.equal((await ada('/api/notes', { method: 'POST', body: { document_id: doc.id, passage_id: passage.id, quote: '', body: NOTE } })).status, 200)
const ents = (await ada('/api/entities')).data
const hero = ents.sort((a, b) => b.facts - a.facts)[0]
const SUMMARY = `Editorial summary ${run}`
assert.equal((await ada(`/api/entities/${hero.id}`, { method: 'PATCH', body: { summary: SUMMARY } })).status, 200)
const png = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA6300010000050001A5F645400000000049454E44AE426082', 'hex')
const form = () => { const f = new FormData(); f.append('file', new Blob([png], { type: 'image/png' }), 'p.png'); return f }
assert.equal((await ada(`/api/entities/${hero.id}/portrait`, { method: 'POST', form: form() })).status, 200)
ok('setup: note, editorial summary, portrait', hero.name)

// Signed out: nothing.
assert.equal((await anon(`/api/export/bible?format=md`)).status, 401)
assert.equal((await anon('/api/shares')).status, 401)
assert.equal((await anon('/api/shares', { method: 'POST', body: { name: 'x' } })).status, 401)
ok('signed out: export and share API refuse', 401)

// Export Markdown: every canon fact with every verified quote; no candidates, notes or people.
const md = await ada(`/api/export/bible?format=md&sections=${ALL}`)
assert.equal(md.status, 200)
assert.match(md.headers.get('content-disposition'), /attachment; filename=".+\.md"/)
const text = md.data.replace(/\n> /g, '\n')
for (const f of canon) {
  assert.ok(text.includes(f.statement), `md has statement: ${f.statement}`)
  for (const e of f.evidence.filter(x => x.verified)) assert.ok(text.includes(e.quote), `md has quote: ${e.quote}`)
}
const canonStatements = new Set(canon.map(f => f.statement))
for (const f of stillPending.filter(p => !canonStatements.has(p.statement))) assert.ok(!text.includes(f.statement), `md leaks candidate: ${f.statement}`)
assert.ok(!text.includes(NOTE), 'md leaks a passage note')
assert.ok(!text.includes(`Ada ${run}`), 'md leaks a user name')
assert.ok(text.includes(SUMMARY) && text.includes('Editorial notes, not canon'), 'editorial included only labelled')
const mdNoEd = (await ada('/api/export/bible?format=md')).data
assert.ok(!mdNoEd.includes(SUMMARY), 'editorial off by default')
ok('export md: every canon fact with its quote, no candidates/notes/names', `${canon.length} facts`)

const zip = await ada(`/api/export/bible?format=zip&images=1&sections=${ALL}`, { raw: true })
assert.equal(zip.status, 200)
assert.equal(zip.buf.readUInt32LE(0), 0x04034B50, 'zip local header')
assert.ok(zip.buf.includes(Buffer.from('images/e-')) && zip.buf.includes(png), 'zip carries the portrait')
assert.ok(zip.buf.includes(Buffer.from(canon[0].statement)), 'zip carries the markdown')
ok('export zip: markdown + portrait', `${zip.buf.length} bytes`)

const audit = async c => (await c('/api/audit')).data.map(e => e.event_type)
assert.ok((await audit(ada)).filter(t => t === 'bible.exported').length >= 3, 'downloads are audited')
const preview = await ada(`/api/export/bible?format=json&sections=${ALL}`)
assert.equal(preview.data.facts.length, canon.length)
ok('export json preview', `${preview.data.facts.length} facts`)
// The print view's load is not audited; only a press of Save as PDF is.
const pdfCount = async () => (await audit(ada)).filter(t => t === 'bible.exported').length
const before = await pdfCount()
await ada(`/api/export/bible?format=json&sections=${ALL}`)
assert.equal(await pdfCount(), before, 'preview/print-view load writes no audit row')
await ada(`/api/export/bible?format=json&for=printed&sections=${ALL}`)
assert.equal(await pdfCount(), before + 1, 'Save as PDF click is audited')
ok('print view load unaudited, Save as PDF audited')

// Viewer: may export, may not create or revoke links.
const bo = await account('Bo')
const invite = (await ada('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 7 } })).data
assert.equal((await bo(`/api/invites/${invite.token}/accept`, { method: 'POST' })).status, 200)
await bo(`/api/projects/${(await bo('/api/me')).data.projects[0].id}/switch`, { method: 'POST' })
assert.equal((await bo('/api/export/bible?format=md')).status, 200)
assert.equal((await bo('/api/shares', { method: 'POST', body: { name: 'Bo link', options: {} } })).status, 403)
ok('viewer: exports, cannot create links', 403)

// Create links: full, entity-scoped, and one to expire.
const mk = async (body) => {
  const r = await ada('/api/shares', { method: 'POST', body })
  assert.equal(r.status, 200, JSON.stringify(r.data))
  return r.data
}
assert.equal((await ada('/api/shares', { method: 'POST', body: { name: '', options: {} } })).status, 400)
assert.equal((await ada('/api/shares', { method: 'POST', body: { name: 'x', days: 3, options: {} } })).status, 400)
assert.equal((await ada('/api/shares', { method: 'POST', body: { name: 'x', options: { scope: 'entities', entity_ids: [] } } })).status, 400)
const full = await mk({ name: 'Voice director', days: 30, options: { scope: 'project', sections: ALL.split(',').filter(s => s !== 'editorial'), images: true } })
const scoped = await mk({ name: 'Hero only', days: null, options: { scope: 'entities', entity_ids: [hero.id], images: false } })
const soon = await mk({ name: 'Expiring', days: 7, options: {} })
assert.match(full.token, /^sbs_[\w-]{32}$/)
assert.equal(scoped.expires_at, null)
const listed = (await ada('/api/shares')).data
assert.equal(listed.length, 3)
assert.ok(!JSON.stringify(listed).includes(full.token) && !JSON.stringify(listed).includes('token_hash'), 'list never exposes a token or hash')
ok('create links, validation, list without secrets', listed.map(s => s.prefix).join(' '))

// Stored hashed.
const db = new DatabaseSync(dbPath)
const row = db.prepare('select * from share_links where id = ?').get(full.id)
assert.equal(row.token_hash, createHash('sha256').update(full.token).digest('hex'))
assert.ok(!JSON.stringify(db.prepare('select * from share_links').all()).includes(full.token), 'no column holds the token')
ok('token stored as sha256 only')

// Public page: only canon with citations; nothing else of the project.
const pub = await anon(`/api/public/share/${full.token}`)
assert.equal(pub.status, 200)
assert.equal(pub.headers.get('referrer-policy'), 'no-referrer')
const b = pub.data
assert.equal(b.facts.length, canon.length)
for (const f of b.facts) {
  assert.ok(canonStatements.has(f.statement), `share shows non-canon: ${f.statement}`)
  assert.ok(f.citations.length > 0 && f.citations.every(c => c.quote && c.document && c.version && c.line_from), `citation on ${f.n}`)
  assert.deepEqual(Object.keys(f).sort(), ['approximate', 'citations', 'entity', 'kind', 'n', 'object', 'predicate', 'sample', 'statement', 'subject', 't_from', 'time_label', 'version'])
}
const blob = JSON.stringify(b)
for (const leak of [NOTE, SUMMARY, `Ada ${run}`, `Bo ${run}`, `ada-${run}@probe.test`, 'decided_by', 'created_by', 'audit', 'token_hash', invite.token, 'Voice director'])
  assert.ok(!blob.includes(leak), `share leaks ${leak}`)
for (const f of stillPending.filter(p => !canonStatements.has(p.statement))) assert.ok(!blob.includes(f.statement), 'share leaks a candidate')
assert.equal(b.studio, `Tidewright ${run}`)
const heroCard = b.entities.find(e => e.name === hero.name)
assert.ok(heroCard?.portrait?.startsWith(`/api/public/share/${full.token}/portrait/`), 'portrait via the link')
assert.equal((await anon(heroCard.portrait, { raw: true })).status, 200)
ok('public json: canon only, cited, no notes/editorial/people/audit', `${b.facts.length} facts`)

const html = await anon(`/share/${full.token}`)
assert.equal(html.status, 200)
assert.equal(html.headers.get('referrer-policy'), 'no-referrer')
assert.ok(html.data.includes('Read-only') && html.data.includes(`shared by Tidewright ${run}`) && html.data.includes(canon[0].statement.replaceAll('\'', '&#39;').replaceAll('"', '&quot;').slice(0, 30)), 'share page renders the bible')
assert.ok(!html.data.includes(NOTE) && !html.data.includes(`Ada ${run}`), 'share page leaks nothing')
ok('public page /share/<token> renders, read-only header')

// A signed-in studio member opening the link: the page payload must hold the bible and nothing of their session.
const me = (await ada('/api/me')).data
const seen = await ada(`/share/${full.token}`)
assert.equal(seen.status, 200)
const sessionBits = [me.user?.id, me.user?.email, me.project?.id, studio.id, 'loggedInAt', `ada-${run}@probe.test`].filter(Boolean)
assert.ok(sessionBits.length >= 3, 'probe knows the signed-in identity')
for (const bit of sessionBits) assert.ok(!seen.data.includes(bit), `signed-in share page leaks ${bit}`)
for (const bit of sessionBits) assert.ok(!html.data.includes(bit), `anonymous share page leaks ${bit}`)
const nuxtData = seen.data.match(/id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? ''
assert.ok(nuxtData.length > 0 && !nuxtData.includes('user'), 'payload carries no user')
ok('share page payload holds no session (signed-in and anonymous)')

// Every public share response, errors and portraits included, is uncacheable, unindexed and sends no referrer.
const hdr = (r, label) => {
  assert.equal(r.headers.get('cache-control'), 'no-store', `${label}: cache-control`)
  assert.equal(r.headers.get('x-robots-tag'), 'noindex', `${label}: x-robots-tag`)
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer', `${label}: referrer-policy`)
}
hdr(pub, 'public json'); hdr(html, 'share page'); hdr(await anon(heroCard.portrait, { raw: true }), 'portrait')
hdr(await anon('/api/public/share/sbs_nope'), 'unknown api 404'); hdr(await anon('/share/sbs_nope'), 'unknown page 404')
hdr(await anon(`/api/public/share/${full.token}/portrait/nope`), 'portrait 404')
ok('no-store, noindex, no-referrer on every public share response')

const sb = (await anon(`/api/public/share/${scoped.token}`)).data
assert.ok(sb.entities.length === 1 && sb.entities[0].name === hero.name && sb.entities[0].portrait === null, 'scoped to one entity, no portraits')
assert.ok(sb.facts.length > 0 && sb.facts.length < canon.length, 'entity scope narrows facts')
assert.equal((await anon(`/api/public/share/${scoped.token}/portrait/${hero.id}`)).status, 404)
ok('entity-scoped link without images', `${sb.facts.length} facts`)

// Other studio: own project and link; never reaches Ada's data.
const cy = await account('Cy')
const cyStudio = (await cy('/api/studios', { method: 'POST', body: { name: `Other ${run}` } })).data
await cy('/api/projects', { method: 'POST', body: { name: 'Lantern Row', studio_id: cyStudio.id } })
assert.equal((await cy('/api/demo/load', { method: 'POST', body: { set: 'lantern-row' } })).status, 200)
const cyEnt = (await cy('/api/entities')).data[0]
assert.equal((await cy(`/api/entities/${cyEnt.id}/portrait`, { method: 'POST', form: form() })).status, 200)
assert.equal((await cy('/api/shares')).data.length, 0, 'Cy sees no links of Ada')
assert.equal((await cy(`/api/shares/${full.id}`, { method: 'DELETE' })).status, 404)
assert.equal((await cy('/api/shares', { method: 'POST', body: { name: 'x', options: { scope: 'entities', entity_ids: [hero.id] } } })).status, 404)
const cyLink = (await cy('/api/shares', { method: 'POST', body: { name: 'Cy link', options: { images: true } } })).data
const cb = (await anon(`/api/public/share/${cyLink.token}`)).data
assert.ok(cb.facts.length > 0 && cb.facts.every(f => f.sample), 'lantern row sample canon, marked')
assert.ok(!JSON.stringify(cb).includes(canon[0].statement) && !JSON.stringify(b).includes(cb.facts[0].statement), 'projects never mix')
assert.equal((await anon(`/api/public/share/${cyLink.token}/portrait/${hero.id}`)).status, 404)
assert.equal((await anon(`/api/public/share/${full.token}/portrait/${cyEnt.id}`)).status, 404)
ok('other studio: own link only, portraits cross-checked', 404)

// Opens counted; only the first is audited.
await anon(`/api/public/share/${full.token}`)
const after = (await ada('/api/shares')).data.find(s => s.id === full.id)
assert.ok(after.open_count >= 3 && after.last_opened_at, 'opens counted')
assert.equal((await audit(ada)).filter(t => t === 'share.opened').length, 2, 'first open of each opened link audited once')
ok('opens counted, first open audited', after.open_count)

// Revoke -> 404 everywhere; expire -> 410; unknown -> 404.
assert.equal((await ada(`/api/shares/${full.id}`, { method: 'DELETE' })).status, 200)
assert.equal((await ada(`/api/shares/${full.id}`, { method: 'DELETE' })).status, 404)
assert.equal((await anon(`/api/public/share/${full.token}`)).status, 404)
assert.equal((await anon(heroCard.portrait)).status, 404)
const gone = await anon(`/share/${full.token}`)
assert.equal(gone.status, 404, 'revoked share page answers 404')
hdr(gone, 'revoked page'); hdr(await anon(`/api/public/share/${full.token}/portrait/${hero.id}`), 'revoked portrait')
assert.ok(gone.data.includes('isn’t available') || gone.data.includes('isn&#39;t available') || gone.data.includes('isn&rsquo;t available'), 'revoked page says so')
db.prepare('update share_links set expires_at = ? where id = ?').run(new Date(Date.now() - 1000).toISOString(), soon.id)
assert.equal((await anon(`/api/public/share/${soon.token}`)).status, 410)
assert.equal((await anon('/api/public/share/sbs_nope')).status, 404)
assert.equal((await anon('/api/public/share/nope')).status, 404)
const statuses = Object.fromEntries((await ada('/api/shares')).data.map(s => [s.name, s.status]))
assert.deepEqual(statuses, { 'Voice director': 'revoked', 'Hero only': 'active', Expiring: 'expired' })
ok('revoked 404, expired 410, unknown 404, statuses listed')

const types = await audit(ada)
for (const t of ['bible.exported', 'share.created', 'share.revoked', 'share.opened']) assert.ok(types.includes(t), `audit has ${t}`)
ok('audit: export, create, revoke, open')
console.log('share probe passed')
