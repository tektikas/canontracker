// Analysis probe against a running server: node scripts/analysis-probe.mjs [baseUrl]
// On Broken Tide (throwaway account):
// - Review filters: GET /api/facts?status=pending&doc=<id> / &folder=<id> narrow the queue to candidates citing that document
//   (any version) or a document in that Library folder or a folder inside it; unknown ids match nothing.
// - Add fact types: subject_type / object_type are stored, must be one of the project's entity types, and a new name's wiki
//   page gets that type instead of the fallback.
// - Acts after death: "dies D3" then "greets D5" is a hard ACTS_AFTER_DEATH conflict on scan; "greets D2" is not.
// - Export: open conflicts are in the bible by default, labelled not canon; leaving the section out drops them.
import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
let cookie = ''
const a = async (path, { method = 'GET', body } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label} (${JSON.stringify(actual)})`) }
const sorted = x => [...x].sort()

check('sign up', (await a('/api/auth/signup', { method: 'POST', body: { name: 'Ana', email: `ana-${run}@probe.test`, password: 'correct horse' } })).status, 200)
const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Analysis Studio' } })).data
check('project', (await a('/api/projects', { method: 'POST', body: { name: 'Broken Tide', studio_id: studio.id } })).status, 200)
check('load broken-tide', (await a('/api/demo/load', { method: 'POST', body: { set: 'broken-tide' } })).status, 200)

// 1. Review filters.
const all = (await a('/api/facts?status=pending')).data
const docs = (await a('/api/documents')).data
const doc = docs.filter(d => d.pending_facts > 0).sort((x, y) => y.pending_facts - x.pending_facts)[0]
const byDoc = (await a(`/api/facts?status=pending&doc=${doc.id}`)).data
check('?doc= keeps only candidates citing that document', [byDoc.length, byDoc.every(f => f.evidence.some(e => e.document_key === doc.filename))], [doc.pending_facts, true])
check('?doc= narrows the queue', byDoc.length < all.length, true)
check('?doc= with an unknown id matches nothing', (await a('/api/facts?status=pending&doc=doc_nope')).data.length, 0)
const parent = (await a('/api/library/folders', { method: 'POST', body: { name: `Book ${run}` } })).data
const child = (await a('/api/library/folders', { method: 'POST', body: { name: 'Part One', parent_id: parent.id } })).data
check('move the document into a subfolder', (await a('/api/library/organise', { method: 'POST', body: { document_ids: [doc.id], folder_id: child.id } })).status, 200)
const ids = list => sorted(list.map(f => f.id))
check('?folder= (the subfolder) = the same candidates', ids((await a(`/api/facts?status=pending&folder=${child.id}`)).data), ids(byDoc))
check('?folder= (the parent) includes its subfolders', ids((await a(`/api/facts?status=pending&folder=${parent.id}`)).data), ids(byDoc))
const other = (await a('/api/library/folders', { method: 'POST', body: { name: `Empty ${run}` } })).data
check('?doc= and ?folder= combine', (await a(`/api/facts?status=pending&doc=${doc.id}&folder=${other.id}`)).data.length, 0)
check('filters work for other statuses too', (await a(`/api/facts?status=canon&doc=${doc.id}`)).status, 200)

// 2. Add fact with types, and 3. acts after death.
const read = (await a(`/api/documents/${doc.id}`)).data
const passage = read.passages.find(p => p.text.replace(/\s+/g, ' ').length > 40 && !/\n\s*\n/.test(p.text))
const quote = passage.text.split('\n')[0].slice(0, 30).trim()
const add = body => a('/api/facts', { method: 'POST', body: { to: 'canon', document_id: doc.id, passage_id: passage.id, quote, kind: 'event', ...body } })
const name = 'Varek Dunn' // a fresh project: no page for these names yet
const place = 'Saltmere Quay'
check('a type outside the project is refused', [(await add({ subject: name, predicate: 'dies', statement: `${name} dies.`, subject_type: 'dragon' })).status], [400])
const died = await add({ subject: name, predicate: 'dies', statement: `${name} dies.`, time_from: 'D3', subject_type: 'faction' })
check('dies D3 (typed faction)', died.status, 200)
const later = await add({ subject: name, predicate: 'greets', object: place, statement: `${name} greets the harbour master at ${place}.`, time_from: 'D5', object_type: 'location' })
const earlier = await add({ subject: name, predicate: 'greets', object: place, statement: `${name} greets the harbour master at ${place} early.`, time_from: 'D2' })
check('greets D5 and D2', [later.status, earlier.status], [200, 200])
const canon = (await a('/api/facts?status=canon')).data
check('types stored as extraction stores them', [died, later, earlier].map(r => canon.find(f => f.id === r.data.id)).map(f => [f.subject_type, f.object_type]), [['faction', null], [null, 'location'], [null, null]])
const pages = (await a('/api/entities')).data
const page = n => pages.find(e => e.name === n)?.kind
check('new pages take the picked types', [page(name), page(place)], ['faction', 'location'])
await a('/api/conflicts/scan', { method: 'POST' })
const conflicts = (await a('/api/conflicts')).data
const deaths = conflicts.filter(c => c.rule === 'ACTS_AFTER_DEATH')
check('acts after death: dies D3, greets D5 (hard); greets D2 is not', deaths.map(c => [c.left_fact_id === died.data.id, c.right_fact_id === later.data.id, c.severity, c.origin]), [[true, true, 'hard', 'rule']])
check('no other acts-after-death conflict in Broken Tide', deaths.length, 1)

// 4. Export: open conflicts by default, labelled not canon.
const bible = (await a('/api/export/bible?format=json')).data
check('open conflicts are a default section', [bible.sections.includes('conflicts'), bible.conflicts.length === conflicts.filter(c => c.status === 'open').length], [true, true])
check('the conflict rule is labelled', bible.conflicts.some(c => c.rule === 'Acts after death'), true)
const md = (await a('/api/export/bible?format=md')).data
check('Markdown labels them not canon', md.includes('## Open conflicts (not canon)'), true)
const without = (await a('/api/export/bible?format=md&sections=overview,facts,sources')).data
check('leaving the section out drops them', without.includes('Open conflicts'), false)
console.log('analysis-probe: all checks passed')
