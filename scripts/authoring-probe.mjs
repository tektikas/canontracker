// Authoring probe against a running dev server: node scripts/authoring-probe.mjs [baseUrl]
// A fresh account with an empty project and no model help: write a scene in the app, add facts from selected text, and
// check those facts behave exactly like accepted canon (evidence, conflicts, impact, Ask, entities, timeline), that
// non-verbatim or blank quotes are refused, that editing makes a new version with stale citations, that notes move
// open → ready → done, that drafts stay private, and that every step is in the audit log under the person who did it.
import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)

function client() {
  let cookie = ''
  const call = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
  call.cookie = () => cookie
  return call
}
const check = (label, actual, expected) => { assert.equal(actual, expected, label); console.log(`ok  ${label} (${actual})`) }
async function account(name) {
  const c = client()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })).status, 200)
  return c
}

const a = await account('Ada')
const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Authoring Studio' } })).data
await a('/api/projects', { method: 'POST', body: { name: 'Own Story', studio_id: studio.id } })
check('new project starts empty', (await a('/api/stats')).data.documents, 0)

// 1. Write a scene: draft (autosave) → save to story → a read-only document with passages.
const scene = [
  '# Harbor Night',
  '',
  'At ten in the morning Arin waits on the Harbor wall, counting the boats.',
  '',
  'Half an hour later Arin is at the Lighthouse, trimming the lamp.',
  '',
  'The walk from the Lighthouse to the Harbor takes forty minutes.',
].join('\n')
const draft = (await a('/api/drafts', { method: 'POST', body: { title: 'Harbor Night', kind: 'scene', content: 'Arin waits.' } })).data
check('draft created', typeof draft.id, 'string')
check('autosave updates the draft', (await a(`/api/drafts/${draft.id}`, { method: 'PUT', body: { content: scene } })).status, 200)
check('draft reads back the latest text', (await a(`/api/drafts/${draft.id}`)).data.content, scene)
check('draft is listed for its author', (await a('/api/drafts')).data.some(d => d.id === draft.id), true)
check('bad kind is refused', (await a(`/api/drafts/${draft.id}`, { method: 'PUT', body: { kind: 'poem' } })).status, 400)
const saved = (await a(`/api/drafts/${draft.id}/save`, { method: 'POST' })).data
check('save to story imports the document', saved.status, 'imported')
check('saved as version 1', saved.version, 1)
check('the draft is gone after saving', (await a(`/api/drafts/${draft.id}`)).status, 404)
let doc = (await a(`/api/documents/${saved.document_id}`)).data
check('written document has passages', doc.passages.length, 4)
check('document origin is written', doc.origin, 'written')
check('document kind is the chosen one', doc.kind, 'scene')
check('document title is the chosen one', doc.title, 'Harbor Night')
check('recorded mode proposes no candidates for own text', (await a('/api/stats')).data.pending, 0)
const empty = (await a('/api/drafts/x/save', { method: 'POST' })).status
check('someone else’s or unknown draft is 404', empty, 404)

const [, harbor, lighthouse, walk] = doc.passages
const fact = (over) => ({ to: 'canon', document_id: doc.id, kind: 'event', subject: 'Arin', predicate: 'located_at', precision: 'exact', ...over })

// 2. Facts from selected text. The quote has to be in the passage word for word.
check('blank quote is refused', (await a('/api/facts', { method: 'POST', body: fact({ passage_id: harbor.id, quote: '   ', object: 'Harbor', statement: 'Arin is at the Harbor.' }) })).status, 422)
check('non-verbatim quote is refused', (await a('/api/facts', { method: 'POST', body: fact({ passage_id: harbor.id, quote: 'Arin waits on the harbour wall', object: 'Harbor', statement: 'Arin is at the Harbor.' }) })).status, 422)
check('quote from another passage’s words is refused', (await a('/api/facts', { method: 'POST', body: fact({ passage_id: harbor.id, quote: 'Arin waits on the Harbor wall, counting the boats. Half', object: 'Harbor', statement: 'x' }) })).status, 422)
check('missing subject is refused', (await a('/api/facts', { method: 'POST', body: fact({ passage_id: harbor.id, quote: 'Arin waits on the Harbor wall', subject: '', object: 'Harbor', statement: 'x' }) })).status, 400)
check('bad story time is refused', (await a('/api/facts', { method: 'POST', body: fact({ passage_id: harbor.id, quote: 'Arin waits on the Harbor wall', object: 'Harbor', statement: 'x', time_from: 'ten am' }) })).status, 400)
check('unknown document is 404', (await a('/api/facts', { method: 'POST', body: fact({ document_id: 'doc_nope', quote: 'Arin', statement: 'x' }) })).status, 404)

const atHarbor = (await a('/api/facts', { method: 'POST', body: fact({ passage_id: harbor.id, quote: 'Arin waits on the Harbor wall', object: 'Harbor', statement: 'Arin is on the Harbor wall from D1 10:00 to D1 11:00.', time_from: 'D1 10:00', time_to: 'D1 11:00' }) }))
check('fact with a verbatim quote goes to canon', atHarbor.data.status, 'canon')
const atLighthouse = (await a('/api/facts', { method: 'POST', body: fact({ passage_id: lighthouse.id, quote: 'Arin is at the Lighthouse, trimming the lamp', object: 'Lighthouse', statement: 'Arin is at the Lighthouse at D1 10:30.', time_from: 'D1 10:30' }) })).data
const walkFact = (await a('/api/facts', { method: 'POST', body: fact({ to: 'review', passage_id: walk.id, quote: 'The walk from the Lighthouse to the Harbor takes forty minutes.', kind: 'rule', subject: 'Lighthouse', predicate: 'travel_time', object: 'Harbor', value: '40', statement: 'The way from Lighthouse to Harbor takes 40 minutes.' }) })).data
check('send to review makes a pending candidate', walkFact.status, 'pending')

const canon = (await a('/api/facts?status=canon')).data
const mine = canon.find(f => f.id === atHarbor.data.id)
check('authored fact is canon', !!mine, true)
check('authored fact is marked human', mine.origin, 'human')
check('authored fact names its author', mine.created_by_name, 'Ada')
check('authored fact was decided by its author', mine.decided_by_name, 'Ada')
check('authored fact has one verified evidence row', mine.evidence.filter(e => e.verified).length, 1)
check('evidence quote is in its passage verbatim', harbor.text.includes(mine.evidence[0].quote), true)
check('evidence points at the selected passage', mine.evidence[0].passage_id, harbor.id)
check('timed fact carries its story time', mine.time_label, 'D1 10:00 – D1 11:00')
const pending = (await a('/api/facts?status=pending')).data.find(f => f.id === walkFact.id)
check('pending authored candidate is marked human, no model', `${pending.origin}/${pending.model_id}`, 'human/null')
check('reviewer accepts the authored candidate', (await a(`/api/facts/${walkFact.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 200)

// 3. Authored canon flows everywhere canon does.
await a('/api/conflicts/scan', { method: 'POST' })
const conflicts = (await a('/api/conflicts')).data
const both = conflicts.find(c => [c.left_fact_id, c.right_fact_id].sort().join() === [atHarbor.data.id, atLighthouse.id].sort().join())
check('conflict scan flags the authored facts', both?.rule, 'EXACT_TIME_LOCATION_OVERLAP')
const change = (await a('/api/changes', { method: 'POST', body: { target_fact_id: atHarbor.data.id, proposed_statement: 'Arin is on the Harbor wall from D1 09:00 to D1 09:45.', rationale: 'probe' } })).data
check('impact reaches the other authored fact', change.impact.some(i => i.target_id === atLighthouse.id), true)
check('impact reaches the scene it was written in', change.impact.some(i => i.target_type === 'scene' && i.target_id === doc.id), true)
const ask = (await a('/api/qa', { method: 'POST', body: { question: 'Where is Arin at the Harbor wall?' } })).data
check('Ask cites the authored fact', ask.cited.some(f => f.id === atHarbor.data.id), true)
const arin = (await a('/api/entities')).data.find(e => e.name === 'Arin')
check('entity page is filed for the authored subject', !!arin, true)
const arinPage = (await a(`/api/entities/${arin.id}`)).data
check('entity page lists the authored facts', arinPage.facts.filter(f => f.origin === 'human').length, 2)
check('entity timeline has the timed authored facts', arinPage.facts.filter(f => f.t_from != null).length, 2)

// 4. Notes pinned to text: open → ready → done; shown in the reader, the entity page and the project list.
const note = (await a('/api/notes', { method: 'POST', body: { document_id: doc.id, passage_id: lighthouse.id, quote: 'trimming the lamp', body: 'Does the lamp need oil here?' } })).data
check('note starts open', note.status, 'open')
check('blank note is refused', (await a('/api/notes', { method: 'POST', body: { document_id: doc.id, passage_id: lighthouse.id, body: ' ' } })).status, 400)
check('note shows in the reader', (await a(`/api/documents/${doc.id}`)).data.notes.find(n => n.id === note.id)?.anchor, lighthouse.id)
check('note shows on the entity page it mentions', (await a(`/api/entities/${arin.id}`)).data.text_notes.some(n => n.id === note.id), true)
check('open notes counted in stats', (await a('/api/stats')).data.open_notes, 1)
check('mark ready', (await a(`/api/notes/${note.id}`, { method: 'PATCH', body: { status: 'ready' } })).data.status, 'ready')
check('mark done', (await a(`/api/notes/${note.id}`, { method: 'PATCH', body: { status: 'done' } })).data.status, 'done')
check('bad note status is refused', (await a(`/api/notes/${note.id}`, { method: 'PATCH', body: { status: 'archived' } })).status, 400)
check('project notes list has it', (await a('/api/notes')).data.some(n => n.id === note.id && n.created_by_name === 'Ada'), true)

// 5. Edit the scene: a new version, the old one untouched, citations flagged stale.
const edit = (await a('/api/drafts', { method: 'POST', body: { document_id: doc.id } })).data
check('edit draft starts from the latest text', edit.content, scene)
check('edit draft remembers the document', (await a(`/api/drafts/${edit.id}`)).data.document.id, doc.id)
check('opening edit again returns the same draft', (await a('/api/drafts', { method: 'POST', body: { document_id: doc.id } })).data.id, edit.id)
const unchanged = (await a(`/api/drafts/${edit.id}/save`, { method: 'POST' })).data
check('saving unchanged text adds no version', unchanged.status, 'unchanged')
const edit2 = (await a('/api/drafts', { method: 'POST', body: { document_id: doc.id } })).data
await a(`/api/drafts/${edit2.id}`, { method: 'PUT', body: { content: scene.replace('counting the boats', 'counting the gulls') } })
const v2 = (await a(`/api/drafts/${edit2.id}/save`, { method: 'POST' })).data
check('edit saves version 2', v2.version, 2)
check('version 1 is unchanged', (await a(`/api/documents/${doc.id}`)).data.content, scene)
const v2doc = (await a(`/api/documents/${v2.document_id}`)).data
check('v2 is the latest', v2doc.latest.id, v2.document_id)
check('v1 points at v2 as latest', (await a(`/api/documents/${doc.id}`)).data.latest.version, 2)
const stale = (await a('/api/facts?status=canon')).data.find(f => f.id === atHarbor.data.id).evidence[0]
check('citation to v1 is flagged stale', stale.latest_version > stale.document_version, true)
const listed = (await a('/api/documents')).data.filter(d => d.filename === doc.filename)
check('sources list the document once, at its latest version', listed.map(d => d.version).join(), '2')
check('the listed document counts canon citing any version', listed[0].canon_facts, 3)
check('stats count documents, not versions', (await a('/api/stats')).data.documents, 1)
check('v2 lists the facts that cite v1, so they can be re-checked', v2doc.facts.some(f => f.id === atHarbor.data.id), true)
check('note from v1 shows on v2 where its words still are', v2doc.notes.find(n => n.id === note.id)?.anchor, v2doc.passages[2].id)
check('facts can’t cite an old version', (await a('/api/facts', { method: 'POST', body: fact({ passage_id: harbor.id, quote: 'Arin waits', object: 'Harbor', statement: 'x' }) })).status, 409)
const form = new FormData()
form.append('files', new Blob(['# Tide Lore\n\nThe sea is cold.'], { type: 'text/markdown' }), 'tide-lore.md')
const upload = await (await fetch(`${base}/api/documents`, { method: 'POST', headers: { cookie: a.cookie() }, body: form })).json()
check('editing an imported file is refused', (await a('/api/drafts', { method: 'POST', body: { document_id: upload.results[0].document_id } })).status, 409)

// 6. Drafts are private: a teammate in the same studio can't open them.
const own = (await a('/api/drafts', { method: 'POST', body: { title: 'Secret', content: 'Not yet.' } })).data
const link = (await a('/api/team/invites', { method: 'POST', body: { role: 'editor', days: 1 } })).data
const e = await account('Eli')
await e(`/api/invites/${link.token}/accept`, { method: 'POST' })
await e(`/api/projects/${(await a('/api/me')).data.current.project.id}/switch`, { method: 'POST' })
check('teammate gets 404 on my draft', (await e(`/api/drafts/${own.id}`)).status, 404)
check('teammate gets 404 saving my draft', (await e(`/api/drafts/${own.id}/save`, { method: 'POST' })).status, 404)
check('teammate’s draft list is empty', (await e('/api/drafts')).data.length, 0)
check('teammate can add a note', (await e('/api/notes', { method: 'POST', body: { document_id: v2doc.id, passage_id: v2doc.passages[1].id, quote: 'counting the gulls', body: 'Gulls or terns?' } })).status, 200)

// 7. The audit log has every step, under the person who did it.
const log = (await a('/api/audit')).data
const by = (type, who = 'Ada') => log.filter(x => x.event_type === type && x.actor_name === who).length
check('audit: document.written', by('document.written'), 1)
check('audit: document.version_written', by('document.version_written'), 1)
check('audit: fact.authored to canon', log.filter(x => x.event_type === 'fact.authored' && x.detail.to === 'canon' && x.actor_name === 'Ada').length, 2)
check('audit: fact.authored to review', log.filter(x => x.event_type === 'fact.authored' && x.detail.to === 'review').length, 1)
check('audit: fact.authored keeps the quote', log.find(x => x.event_type === 'fact.authored').detail.quote.length > 0, true)
check('audit: note.created', by('note.created') + by('note.created', 'Eli'), 2)
check('audit: note.updated', by('note.updated'), 2)
check('audit: citation.stale names the authored facts', log.find(x => x.event_type === 'citation.stale')?.detail.fact_ids.includes(atHarbor.data.id), true)
console.log('all checks passed')
