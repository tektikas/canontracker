// Research probe against a running server in mock mode (the default): node scripts/research-probe.mjs [baseUrl]
// Mock mode has no live model, so research says so honestly, except for the recorded probe fixture
// (server/assets/research/recorded.json): a follow-up and one answered question with real calculator numbers. Checks the
// note (verdict, sources with their check status, calculations, trace), promote → pending candidate (never canon) citing a
// read-only basis document, accept through the normal review gate, pin/unpin, the research profile, viewer and studio
// isolation, and the audit trail.
import assert from 'node:assert/strict'

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
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label} (${JSON.stringify(actual)})`) }
async function account(name) {
  const c = client()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@research-probe.test`, password: 'correct horse' } })).status, 200)
  return c
}

const a = await account('Rosa')
const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Research Probe Studio' } })).data
const project = (await a('/api/projects', { method: 'POST', body: { name: 'Research probe', studio_id: studio.id } })).data
check('mock mode', (await a('/api/stats')).data.model.mode, 'mock')

// 1. Research profile on the project (admin+), validated, merged field by field.
check('profile starts empty', (await a(`/api/projects/${project.id}`)).data.project.research_profile, { field: '', period: '', place: '', legal_system: '', notes: '' })
check('profile saves', (await a(`/api/projects/${project.id}`, { method: 'PATCH', body: { research_profile: { field: 'science_fiction', period: '2190s', place: 'Jupiter system' } } })).data.research_profile,
  { field: 'science_fiction', period: '2190s', place: 'Jupiter system', legal_system: '', notes: '' })
check('profile keeps fields it was not sent', (await a(`/api/projects/${project.id}`, { method: 'PATCH', body: { research_profile: { notes: 'Hard SF: no FTL.' } } })).data.research_profile.place, 'Jupiter system')
check('unknown field refused', (await a(`/api/projects/${project.id}`, { method: 'PATCH', body: { research_profile: { field: 'fantasy' } } })).status, 400)
check('overlong period refused', (await a(`/api/projects/${project.id}`, { method: 'PATCH', body: { research_profile: { period: 'x'.repeat(201) } } })).status, 400)

// 2. Mock mode without a recording: an honest message, no note, nothing invented.
const offline = await a('/api/research', { method: 'POST', body: { question: 'Could a human survive a week on Europa’s surface?' } })
check('unrecorded question answers 200', offline.status, 200)
check('…says research needs the live model', /live AI model/.test(offline.data.text), true)
check('…stores no note', (await a('/api/research')).data.length, 0)
check('empty question refused', (await a('/api/research', { method: 'POST', body: { question: '  ' } })).status, 400)
check('history must be a list', (await a('/api/research', { method: 'POST', body: { question: 'x', history: 'no' } })).status, 400)

// 3. Recorded follow-up: a question that lacks something essential gets a question back with options, no note.
const fu = await a('/api/research', { method: 'POST', body: { question: 'How fast could the ship get there?' } })
check('follow-up kind', fu.data.kind, 'followup')
check('follow-up has 1–3 options', fu.data.followup.options.length >= 1 && fu.data.followup.options.length <= 3, true)
check('follow-up stores no note', (await a('/api/research')).data.length, 0)

// 4. Recorded answer: a note with verdict, checked sources, real calculator numbers and a trace.
const QUESTION = 'How far does Europa orbit from Jupiter, and what is the one-way light delay from Earth to Europa at 628 million km?'
const ans = await a('/api/research', { method: 'POST', body: { question: QUESTION } })
check('answer kind', ans.data.kind, 'answer')
check('one note id', ans.data.noteIds.length, 1)
const noteId = ans.data.noteIds[0]
let note = (await a(`/api/research/${noteId}`)).data
check('note question', note.question, QUESTION)
check('verdict is one of the four', ['established', 'speculative', 'contradicts', 'unknown'].includes(note.verdict), true)
check('labelled recorded', note.recorded, 1)
const delay = note.calculations.find(c => c.name === 'light_delay')
check('light delay computed by the calculator', delay.result.one_way.minutes, 34.913)
check('calculation states its assumptions', delay.assumptions.length > 0, true)
check('every source has a check status', note.sources.every(s => ['verified', 'unverified', 'not_checked'].includes(s.status)), true)
check('a calculator claim names a tool this run called', note.claims.filter(c => c.basis === 'calculator').every(c => note.calculations.some(k => k.name === c.tool)), true)
check('trace has the recorded step', note.trace.length >= 1 && note.trace.every(t => t.model_id === 'mock:recorded-fixtures'), true)
const list = (await a('/api/research')).data
check('listed', list.map(n => n.id), [noteId])
check('list counts verified sources', list[0].sources.total, note.sources.length)
check('unknown note 404', (await a('/api/research/rn_nope')).status, 404)

// 5. Promote → pending candidate only, citing a read-only basis document; never canon by itself.
const pendingBefore = (await a('/api/facts?status=pending')).data.length
const docsBefore = (await a('/api/documents')).data.length
const bad = await a(`/api/research/${noteId}/promote`, { method: 'POST', body: { as: 'fact', kind: 'claim', subject: 'Europa', predicate: 'signal_delay', statement: 'x', quote: 'words that are nowhere in this note at all' } })
check('quote not in the note refused', bad.status, 422)
check('…and leaves no basis document', (await a('/api/documents')).data.length, docsBefore)
check('bad target refused', (await a(`/api/research/${noteId}/promote`, { method: 'POST', body: { as: 'canon' } })).status, 400)
const quote = note.answer.split(/(?<=[.!?])\s+/)[0]
const prom = await a(`/api/research/${noteId}/promote`, { method: 'POST', body: { as: 'rule', subject: 'Earth–Europa signals', statement: 'A message between Earth and Europa takes about 35 minutes one way at 628 million km.', quote } })
check('promote as rule', prom.status, 200)
check('…is pending, not canon', prom.data.status, 'pending')
const pending = (await a('/api/facts?status=pending')).data
check('one more candidate in review', pending.length, pendingBefore + 1)
const cand = pending.find(f => f.id === prom.data.id)
check('candidate kind rule', cand.kind, 'rule')
check('candidate origin links the note', cand.origin, `research:${noteId}`)
check('candidate evidence verified', cand.evidence[0].verified, 1)
check('candidate cites the basis document', cand.evidence[0].document_id, prom.data.document_id)
check('canon untouched', (await a('/api/facts?status=canon')).data.length, 0)
const docs = (await a('/api/documents')).data
const basis = docs.find(d => d.id === prom.data.document_id)
check('basis document saved', basis.origin, 'research')
check('basis document in the Research folder', !!basis.folder_id, true)
const basisText = (await a(`/api/documents/${basis.id}`)).data
check('basis document holds the question', basisText.content.includes(QUESTION), true)
const event = await a(`/api/research/${noteId}/promote`, { method: 'POST', body: { as: 'fact', kind: 'event', subject: 'Relay', predicate: 'message_sent', statement: 'The relay sends the warning.', quote, time_from: 'D3 22:00', time_to: 'D3 23:00', precision: 'approximate' } })
check('promote as timed event', event.status, 200)
check('second promote reuses the basis document', event.data.document_id, prom.data.document_id)
check('bad story time refused', (await a(`/api/research/${noteId}/promote`, { method: 'POST', body: { as: 'fact', kind: 'event', subject: 'Relay', predicate: 'x', statement: 'x', quote, time_from: 'tomorrow' } })).status, 400)
note = (await a(`/api/research/${noteId}`)).data
check('note lists its candidates', note.candidates.map(c => c.id).sort(), [prom.data.id, event.data.id].sort())
// The normal human gate turns it into canon.
check('reviewer accepts the candidate', (await a(`/api/facts/${prom.data.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 200)
check('now canon', (await a('/api/facts?status=canon')).data.map(f => f.id), [prom.data.id])

// 6. Pin to a story passage (like a note); wrong words refused; unpin.
const draft = (await a('/api/drafts', { method: 'POST', body: { title: 'Relay Night', kind: 'scene', content: 'Mara waits at the relay for the answer from Earth.\n\nIt does not come before dawn.' } })).data
const scene = (await a(`/api/drafts/${draft.id}/save`, { method: 'POST' })).data
check('pin with words not in the document refused', (await a(`/api/research/${noteId}`, { method: 'PATCH', body: { pin: { document_id: scene.document_id, quote: 'not in this scene anywhere' } } })).status, 422)
const pinned = await a(`/api/research/${noteId}`, { method: 'PATCH', body: { pin: { document_id: scene.document_id, quote: 'waits at the relay' } } })
check('pinned', pinned.data.pin_quote, 'waits at the relay')
check('pinned line', pinned.data.pin_line, 1)
check('unpinned', (await a(`/api/research/${noteId}`, { method: 'PATCH', body: { pin: null } })).data.pin_passage_id, null)
check('pin needs a body', (await a(`/api/research/${noteId}`, { method: 'PATCH', body: {} })).status, 400)

// 7. Viewer reads research but cannot run or change it; another studio sees nothing.
const link = (await a('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 7 } })).data
const v = await account('Vic')
await v(`/api/invites/${link.token}/accept`, { method: 'POST' })
await v(`/api/projects/${project.id}/switch`, { method: 'POST' })
check('viewer reads the note', (await v(`/api/research/${noteId}`)).status, 200)
check('viewer cannot research', (await v('/api/research', { method: 'POST', body: { question: QUESTION } })).status, 403)
check('viewer cannot promote', (await v(`/api/research/${noteId}/promote`, { method: 'POST', body: { as: 'rule' } })).status, 403)
check('viewer cannot pin', (await v(`/api/research/${noteId}`, { method: 'PATCH', body: { pin: null } })).status, 403)
check('viewer cannot change the profile', (await v(`/api/projects/${project.id}`, { method: 'PATCH', body: { research_profile: { notes: 'x' } } })).status, 403)
const b = await account('Boris')
const sb = (await b('/api/studios', { method: 'POST', body: { name: 'Other Studio' } })).data
await b('/api/projects', { method: 'POST', body: { name: 'Other', studio_id: sb.id } })
check('other studio: 404 on the note', (await b(`/api/research/${noteId}`)).status, 404)
check('other studio: empty list', (await b('/api/research')).data.length, 0)
check('other studio: 404 promoting', (await b(`/api/research/${noteId}/promote`, { method: 'POST', body: { as: 'rule', subject: 'x', statement: 'x', quote } })).status, 404)
check('other studio: 404 pinning', (await b(`/api/research/${noteId}`, { method: 'PATCH', body: { pin: null } })).status, 404)

// 8. Audit trail.
const events = (await a('/api/audit')).data.map(e => e.event_type)
for (const t of ['research.created', 'research.promoted', 'document.research_saved', 'research.pinned', 'research.unpinned'])
  check(`audited ${t}`, events.includes(t), true)

console.log('\nresearch-probe: all checks passed')
