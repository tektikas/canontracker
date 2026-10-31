// Search probe against a running server: node scripts/search-probe.mjs [baseUrl]
// GET /api/search: project isolation (another studio and another project see nothing of this one), a viewer may search,
// every group returns (facts, entities by alias, documents by title and by text with the exact passage, notes), candidates
// and rejected facts never appear as canon, the limit per group holds, odd input is safe, and signed-out gets 401.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)

function client() {
  let cookie = ''
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
}
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label}`) }
async function owner(name) {
  const c = client()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })).status, 200)
  const studio = (await c('/api/studios', { method: 'POST', body: { name: `${name} Studio` } })).data
  const project = (await c('/api/projects', { method: 'POST', body: { name: 'Broken Tide', studio_id: studio.id } })).data
  return { c, studio, project }
}
const search = async (c, q) => (await c(`/api/search?q=${encodeURIComponent(q)}`))

const ada = await owner('Ada')
check('demo loads', (await ada.c('/api/demo/load', { method: 'POST' })).status, 200)
// The demo loads candidates only: a person accepts some, rejects one, and leaves the rest pending.
const first = (await ada.c('/api/facts?status=pending')).data
const verified = first.filter(f => f.evidence.some(e => e.verified))
for (const f of verified.slice(0, 8)) assert.equal((await ada.c(`/api/facts/${f.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 200)
const rej = first.find(f => !verified.slice(0, 8).includes(f))
assert.equal((await ada.c(`/api/facts/${rej.id}/review`, { method: 'POST', body: { decision: 'reject', rationale: 'probe' } })).status, 200)
const canon = (await ada.c('/api/facts?status=canon')).data
const pending = [...(await ada.c('/api/facts?status=pending')).data, rej]
assert.ok(canon.length > 3 && pending.length > 0, 'demo has canon and pending facts')

// Facts: canon only.
const cf = canon[0]
check('fact found by a word of its statement', (await search(ada.c, cf.statement.split(' ').slice(0, 3).join(' '))).data.facts.some(f => f.id === cf.id), true)
const canonIds = new Set(canon.map(f => f.id))
for (const p of pending) for (const q of [p.statement, p.subject, p.object ?? p.subject]) {
  const got = (await search(ada.c, q)).data.facts
  assert.ok(got.every(f => canonIds.has(f.id)), `candidate "${p.id}" leaked as canon for "${q}"`)
}
console.log(`ok  ${pending.length} pending candidates never come back as canon facts`)

// Entities: by name, by an alias, and by a merged name's page.
const ents = (await ada.c('/api/entities')).data
const ent = ents.find(e => e.facts > 0) ?? ents[0]
const alias = `Zorblax${run}`
check('alias saved', (await ada.c(`/api/entities/${ent.id}`, { method: 'PATCH', body: { aliases: [...ent.aliases, alias] } })).status, 200)
let r = (await search(ada.c, alias)).data
check('entity found by alias, with the alias shown', r.entities.map(e => [e.id, e.via]), [[ent.id, alias]])
check('entity found by name', (await search(ada.c, ent.name)).data.entities.some(e => e.id === ent.id), true)

// Documents: by title, and by text (opens the passage that holds the words).
const docs = (await ada.c('/api/documents')).data
const d = docs[0]
r = (await search(ada.c, d.title)).data
check('document found by title', r.documents.some(x => x.id === d.id), true)
const full = (await ada.c(`/api/documents/${d.id}`)).data
const p = full.passages.find(x => x.text.split(/\s+/).length > 6)
const phrase = p.text.split(/\s+/).slice(2, 5).join(' ')
r = (await search(ada.c, phrase)).data
const hit = r.documents.find(x => x.passage_id === p.id)
assert.ok(hit, `text match opens the passage (${phrase})`)
check('text match carries snippet and line', [typeof hit.snippet, hit.line], ['string', p.start_line])
assert.ok(hit.snippet.toLowerCase().includes(phrase.split(' ')[0].toLowerCase()), 'snippet shows the match')
console.log('ok  document text match -> exact passage')

// Notes: editorial, their own group.
const note = (await ada.c('/api/notes', { method: 'POST', body: { document_id: d.id, passage_id: p.id, body: `Remember the lantern${run} here.` } })).data
r = (await search(ada.c, `lantern${run}`)).data
check('note found by body', r.notes.map(n => [n.id, n.passage_id, n.document_id]), [[note.id, p.id, d.id]])
check('a note is not a fact or entity or document', [r.facts.length, r.entities.length, r.documents.length], [0, 0, 0])

// Odd input and limits.
check('empty query is empty', (await search(ada.c, '')).data, { q: '', facts: [], entities: [], documents: [], notes: [] })
for (const q of ['%', '_', "'; drop table facts; --", '\\', 'a'.repeat(500)]) assert.equal((await search(ada.c, q)).status, 200)
console.log('ok  wildcards, quotes and long input are safe')
check('a bare % matches nothing, not everything', (await search(ada.c, '%')).data.facts.length, 0)
r = (await search(ada.c, 'a')).data
assert.ok([r.facts, r.entities, r.documents, r.notes].every(g => g.length <= 6), 'limit per group')
console.log('ok  at most 6 per group')

// Viewer in the same project may search; another studio and another project see nothing.
const link = (await ada.c('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 1 } })).data
const v = client()
await v('/api/auth/signup', { method: 'POST', body: { name: 'Vik', email: `vik-${run}@probe.test`, password: 'correct horse' } })
await v(`/api/invites/${link.token}/accept`, { method: 'POST' })
r = await search(v, `lantern${run}`)
check('viewer can search', [r.status, r.data.notes.length], [200, 1])
check('viewer is a viewer (cannot scan)', (await v('/api/conflicts/scan', { method: 'POST' })).status, 403)

const bob = await owner('Bob')
r = (await search(bob.c, alias)).data
check('another studio sees none of it', [r.facts, r.entities, r.documents, r.notes].map(g => g.length), [0, 0, 0, 0])
r = (await search(bob.c, 'lantern')).data
check('another studio: notes empty', r.notes, [])
// A second project of the same owner is empty until it has content.
const second = (await ada.c('/api/projects', { method: 'POST', body: { name: 'Second', studio_id: ada.studio.id } })).data
await ada.c(`/api/projects/${second.id}/switch`, { method: 'POST' })
r = (await search(ada.c, alias)).data
check('another project in the same studio is isolated', [r.facts, r.entities, r.documents, r.notes].map(g => g.length), [0, 0, 0, 0])
await ada.c(`/api/projects/${project_id(ada)}/switch`, { method: 'POST' })
check('switching back finds it again', (await search(ada.c, alias)).data.entities.length, 1)

check('signed out is 401', (await client()('/api/search?q=tide')).status, 401)
// Throttle: a burst is cut off with 429 and rejected requests keep no state (server memory stays flat).
const pidOf = (port) => { try { return execFileSync('ss', ['-ltnpH', `sport = :${port}`], { encoding: 'utf8' }).match(/pid=(\d+)/)?.[1] } catch {} }
const rss = (pid) => Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) / 1024
const spid = /localhost|127\.0\.0\.1/.test(base) ? pidOf(new URL(base).port) : undefined
const burst = await owner('Burst')
let rssBefore
const codes = { 200: 0, 429: 0 }
for (let i = 0; i < 10_000; i++) {
  if (i === 5_000 && spid) rssBefore = rss(spid) // after warm-up: a fresh server's heap grows by itself at first
  const s = (await burst.c('/api/search?q=tide')).status; codes[s] = (codes[s] ?? 0) + 1 }
check('burst of 10,000: at most 200 served, the rest 429', [codes[200] <= 200, codes[429] >= 9_800, codes[200] + codes[429]], [true, true, 10_000])
if (spid) { const grew = rss(spid) - rssBefore; check(`10,000 rejected requests keep memory flat (grew ${grew.toFixed(0)} MiB, under 40)`, grew < 40, true) }
console.log('\nall search probes passed')

function project_id(a) { return a.project.id }
