// Seeded random merge-identity sequence against a running server:
//   node scripts/merge-fuzz.mjs <baseUrl> <path to the server's .data/storybible.db> [seed] [steps] [--uncapped]
// Loads the demo into a throwaway account, then creates/deletes pages by hand, renames pages, adds/removes aliases, merges,
// re-imports edited scenes, re-extracts scenes and accepts candidates in random order. --uncapped lets merges run until one page is left (by default
// they stop at 5). After every step it asserts that analysis follows the merge decisions and nothing else:
// canon never names a merged-away name, every mapping is terminal (its target is a live entity's analysis name, or a
// canonical name whose page was deleted, which then stays as it is until a merge moves it), analysis names never change,
// a scan raises no location conflict between two names of one identity, and travel-rule impact reaches every fact of its
// identities. The database is opened read-only to see entity_merges and analysis_name, which no route exposes.
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'

const argv = process.argv.slice(2)
const uncapped = argv.includes('--uncapped')
const [base = 'http://localhost:3000', dbPath = '.data/storybible.db', seedArg, stepsArg] = argv.filter(a => a !== '--uncapped')
const seed = Number(seedArg ?? Date.now() % 1e9)
const steps = Number(stepsArg ?? 200)
const run = `${seed.toString(36)}-${Date.now().toString(36)}`

// mulberry32
let s = seed >>> 0
const rand = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const pick = a => a[Math.floor(rand() * a.length)]
const norm = n => n?.trim().replace(/\s+/g, ' ').toLowerCase() || ''

let cookie = ''
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = form ? { cookie } : { 'content-type': 'application/json', cookie }
  const res = await fetch(base + path, { method, headers, body: form ?? (body && JSON.stringify(body)) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}
const ok = (r, label, allowed = [200]) => { assert.ok(allowed.includes(r.status), `${label}: ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`); return r }

assert.equal((await api('/api/auth/signup', { method: 'POST', body: { name: 'Fuzz', email: `fuzz-${run}@probe.test`, password: 'correct horse' } })).status, 200)
const studio = (await api('/api/studios', { method: 'POST', body: { name: 'Fuzz Studio' } })).data
const project = (await api('/api/projects', { method: 'POST', body: { name: 'Merge Fuzz', studio_id: studio.id } })).data
ok(await api('/api/demo/load', { method: 'POST' }), 'demo load')
// S06 and S10 candidates stay pending, so accepts and the pending re-pin on a new version have something to work on.
for (const f of (await api('/api/facts?status=pending')).data)
  if (f.evidence.some(e => e.verified) && !f.evidence.some(e => /^S(06|10)\.md$/.test(e.document_filename))) ok(await api(`/api/facts/${f.id}/review`, { method: 'POST', body: { decision: 'accept' } }), 'accept')
const travel = (await api('/api/facts?status=canon')).data.find(f => f.predicate === 'travel_time')
assert.ok(travel, 'demo has a travel rule')
const change = ok(await api('/api/changes', { method: 'POST', body: { target_fact_id: travel.id, proposed_statement: 'The trip takes an hour.', rationale: 'fuzz' } }), 'proposal').data

const db = new DatabaseSync(dbPath, { readOnly: true })
const q = (sql, ...a) => db.prepare(sql).all(...a)
const merges = () => new Map(q('select name_norm, canonical from entity_merges where project_id = ?', project.id).map(m => [m.name_norm, m.canonical]))
const entityRows = () => q('select id, name, aliases, analysis_name from entities where project_id = ?', project.id)
const resolve = (m, n) => (n && m.has(norm(n)) ? norm(m.get(norm(n))) : norm(n))

let lastMerges = merges()
const pinned = new Map() // entity id → analysis_name once set
const counts = {}

async function checkInvariants(step, action) {
  const m = merges()
  const ents = entityRows()
  const canon = q(`select id, subject, predicate, object from facts where project_id = ? and status = 'canon'`, project.id)
  // Canon never names a merged-away name.
  for (const f of canon) for (const n of [f.subject, f.object])
    assert.ok(!m.has(norm(n)), `canon fact ${f.id} still names "${n}", merged into "${m.get(norm(n))}"`)
  // Mappings are terminal and point at a live entity's analysis name.
  const identities = new Map(ents.map(e => [norm(e.analysis_name ?? e.name), e]))
  assert.equal(identities.size, ents.length, 'two pages share one analysis name')
  // A target without a live page is allowed only after that page was deleted (the mapping table is then unchanged, checked
  // below); canon must not name the target under some other page's identity.
  for (const [from, to] of m) {
    assert.ok(!m.has(norm(to)), `mapping ${from} → ${to} points at a merged-away name`)
    if (!identities.has(norm(to))) {
      for (const e of ents) for (const n of [e.name, ...JSON.parse(e.aliases)])
        assert.ok(norm(n) !== norm(to) || norm(e.analysis_name ?? e.name) === norm(to), `mapping target "${to}" has no page but is a name of ${e.name}`)
    }
  }
  for (const id of identities.keys()) assert.ok(!m.has(id), `live identity "${id}" is also mapped away`)
  // Mappings only change on a merge; a stored analysis name never changes.
  if (action !== 'merge') assert.deepEqual(m, lastMerges, `entity_merges changed on ${action}`)
  lastMerges = m
  for (const e of ents) {
    if (pinned.has(e.id)) assert.equal(e.analysis_name, pinned.get(e.id), `analysis name of ${e.id} changed`)
    else if (e.analysis_name !== null) pinned.set(e.id, e.analysis_name)
  }
  // Client lookups (mentions, relationships) get every linking name: the analysis name and the names merged into it.
  const listed = new Map((await api('/api/entities')).data.map(e => [e.id, new Set(e.names.map(norm))]))
  for (const e of entityRows()) {
    const names = listed.get(e.id)
    if (!names) continue // filed by this very list call
    const id = norm(e.analysis_name ?? e.name)
    assert.ok(names.has(id), `list names of ${e.name} miss its analysis name "${id}"`)
    for (const [from, to] of m) if (norm(to) === id) assert.ok(names.has(from), `list names of ${e.name} miss merged name "${from}"`)
  }
  // A scan raises no location conflict between two names of one identity.
  ok(await api('/api/conflicts/scan', { method: 'POST' }), 'scan')
  for (const c of (await api('/api/conflicts')).data.filter(c => c.status === 'open' && c.origin === 'rule' && /LOCATION|TRAVEL/.test(c.rule)))
    assert.notEqual(resolve(m, c.left.object), resolve(m, c.right.object), `open ${c.rule} ${c.id} between "${c.left.object}" and "${c.right.object}", one identity`)
  // Impact from the travel rule reaches every canon fact naming either of its identities.
  const t = canon.find(f => f.id === travel.id)
  const ids = new Set([resolve(m, t.subject), resolve(m, t.object)])
  const want = canon.filter(f => f.id !== t.id && [f.subject, f.object].some(n => n && ids.has(resolve(m, n)))).map(f => f.id)
  const got = new Set(ok(await api(`/api/changes/${change.id}/analyze`, { method: 'POST' }), 'analyze').data.impact.filter(i => i.target_type === 'fact').map(i => i.target_id))
  for (const id of want) assert.ok(got.has(id), `travel impact misses ${id}`)
}

const actions = {
  async rename() {
    const e = pick(entityRows())
    const name = rand() < 0.3 ? pick([...lastMerges.keys(), ...entityRows().map(x => x.analysis_name ?? x.name)]) : `Place ${Math.floor(rand() * 1e6)}`
    return ok(await api(`/api/entities/${e.id}`, { method: 'PATCH', body: { name } }), `rename ${e.name} → ${name}`, [200, 409])
  },
  async addAlias() {
    const e = pick(entityRows())
    const alias = rand() < 0.5 ? pick([...lastMerges.keys(), ...entityRows().map(x => x.name)]) : `Alias ${Math.floor(rand() * 1e6)}`
    return ok(await api(`/api/entities/${e.id}`, { method: 'PATCH', body: { aliases: [...JSON.parse(e.aliases), alias] } }), `alias ${e.name} + ${alias}`, [200, 409])
  },
  async removeAlias() {
    const e = pick(entityRows().filter(x => JSON.parse(x.aliases).length))
    if (!e) return { status: 'skip' }
    const aliases = JSON.parse(e.aliases)
    aliases.splice(Math.floor(rand() * aliases.length), 1)
    return ok(await api(`/api/entities/${e.id}`, { method: 'PATCH', body: { aliases } }), `unalias ${e.name}`, [200, 409])
  },
  async create() {
    const name = rand() < 0.4 ? pick([...lastMerges.keys(), ...lastMerges.values(), ...entityRows().map(x => x.name)]) : `Hand ${Math.floor(rand() * 1e6)}`
    return ok(await api('/api/entities', { method: 'POST', body: { name, kind: pick(['character', 'location', 'item', 'faction', 'other']) } }), `create ${name}`, [200, 409])
  },
  async remove() {
    const e = pick(entityRows())
    if (!e) return { status: 'skip' }
    return ok(await api(`/api/entities/${e.id}`, { method: 'DELETE' }), `delete ${e.name}`, [200, 409])
  },
  async merge() {
    const ents = entityRows()
    if (ents.length <= (uncapped ? 1 : 5)) return { status: 'skip' } // by default keep a few identities apart so conflicts and impact stay meaningful
    // Mostly places, so conflicts and travel impact are at stake.
    const places = new Set(q(`select object from facts where project_id = ? and status = 'canon' and predicate in ('located_at', 'travel_time')`, project.id).map(f => norm(f.object)))
    const pool = rand() < 0.7 ? ents.filter(e => places.has(norm(e.analysis_name ?? e.name))) : ents
    const src = pick(pool.length > 1 ? pool : ents)
    const dst = pick(ents.filter(e => e.id !== src.id))
    return ok(await api(`/api/entities/${src.id}/merge`, { method: 'POST', body: { into: dst.id } }), `merge ${src.name} → ${dst.name}`, [200, 409])
  },
  // A new version of a scene, edited, after merges and aliases exist. Recorded output belongs to the sample's own text only,
  // so the edited version proposes nothing; its pending citations follow it where the quote is still there once.
  async reimport() {
    const docs = (await api('/api/documents')).data.filter(d => /^S\d+\.md$/.test(d.filename))
    const doc = rand() < 0.6 ? docs.find(d => d.filename === 'S06.md') : pick(docs)
    const content = (await api(`/api/documents/${doc.id}`)).data.content
    const text = `${content}\n\nDraft ${Math.floor(rand() * 1e6)}.\n`
    const onDoc = (await api('/api/facts?status=pending')).data.filter(f => f.evidence.some(e => e.document_id === doc.id && e.verified))
    const form = new FormData()
    form.append('files', new Blob([text], { type: 'text/markdown' }), doc.filename)
    const r = ok(await api('/api/documents', { method: 'POST', form }), `reimport ${doc.filename}`)
    const up = r.data.results[0]
    assert.equal(up.version, doc.version + 1, `reimport ${doc.filename}: version`)
    assert.equal(up.candidates, 0, `reimport ${doc.filename}: edited text got recorded candidates`)
    // The text only grew, so every pending citation on the old version follows it (subject/object untouched).
    assert.equal(up.evidence_moved, onDoc.length, `reimport ${doc.filename}: pending citations moved`)
    const now = new Map((await api('/api/facts?status=pending')).data.map(f => [f.id, f]))
    for (const f of onDoc) {
      const g = now.get(f.id)
      assert.ok(g && g.evidence.every(e => e.document_id === up.document_id && e.verified), `reimport ${doc.filename}: ${f.id} still cites v${doc.version}`)
      assert.deepEqual([g.subject, g.object], [f.subject, f.object], `reimport ${doc.filename}: ${f.id} names changed`)
    }
    return r
  },
  // Candidates come back by re-extracting a scene (recorded output only while it still holds the sample's text).
  async reextract() {
    const docs = (await api('/api/documents')).data.filter(d => /^S\d+\.md$/.test(d.filename))
    const doc = rand() < 0.6 ? docs.find(d => d.filename === 'S06.md') : pick(docs)
    return ok(await api(`/api/documents/${doc.id}/extract`, { method: 'POST' }), `re-extract ${doc.filename}`)
  },
  async accept() {
    const pending = (await api('/api/facts?status=pending')).data.filter(f => f.evidence.some(e => e.verified))
    if (!pending.length) return { status: 'skip' }
    const f = pick(pending)
    return ok(await api(`/api/facts/${f.id}/review`, { method: 'POST', body: { decision: 'accept' } }), `accept ${f.statement}`)
  },
}
const weights = [['rename', 3], ['addAlias', 2], ['removeAlias', 2], ['create', 2], ['remove', 2], ['merge', 3], ['reimport', 2], ['reextract', 2], ['accept', 3]]
const total = weights.reduce((a, [, w]) => a + w, 0)

let step = 0
let action = 'setup'
try {
  await api('/api/entities') // files pages for canon names
  await checkInvariants(0, 'setup')
  for (step = 1; step <= steps; step++) {
    let r = rand() * total
    action = weights.find(([, w]) => (r -= w) < 0)[0]
    await api('/api/entities') // the wiki files pages for new canon names when it is opened
    const res = await actions[action]()
    counts[`${action} ${res.status}`] = (counts[`${action} ${res.status}`] ?? 0) + 1
    await checkInvariants(step, action === 'merge' && res.status === 200 ? 'merge' : action)
  }
} catch (e) {
  console.error(`FAILED at step ${step} (${action}), seed ${seed}: ${e.message}`)
  process.exit(1)
}
console.log(Object.entries(counts).sort().map(([k, v]) => `${k}: ${v}`).join(', '))
console.log(`merges recorded: ${lastMerges.size}; entities left: ${entityRows().length}`)
console.log(`all ${steps} steps passed, seed ${seed}${uncapped ? ' (uncapped)' : ''}`)
