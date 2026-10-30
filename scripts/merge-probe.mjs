// Merge identity probe against a running server: node scripts/merge-probe.mjs [baseUrl]
// Loads the demo into a throwaway account, merges Lighthouse into Causeway and asserts that everything downstream follows:
// pending change impact goes stale (CSV export says so too), conflicts whose premise vanished close, model prompts get the
// canonical names, later candidates map to the name fixed at merge time even after the kept page is renamed, and the
// project medium only accepts real keys.
import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)

function client() {
  let cookie = ''
  return async (path, { method = 'GET', body, form } = {}) => {
    const headers = form ? { cookie } : { 'content-type': 'application/json', cookie }
    const res = await fetch(base + path, { method, headers, body: form ?? (body && JSON.stringify(body)) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
}
const check = (label, actual, expected) => { assert.equal(actual, expected, label); console.log(`ok  ${label} (${actual})`) }
const names = f => [f.subject, f.object]

const a = client()
assert.equal((await a('/api/auth/signup', { method: 'POST', body: { name: 'Mo', email: `mo-${run}@probe.test`, password: 'correct horse' } })).status, 200)
const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Merge Studio' } })).data
const project = (await a('/api/projects', { method: 'POST', body: { name: 'Merge Probe', studio_id: studio.id } })).data
check('demo loads', (await a('/api/demo/load', { method: 'POST' })).status, 200)

// Accept every candidate whose quote is verified, then scan.
for (const f of (await a('/api/facts?status=pending')).data)
  if (f.evidence.some(e => e.verified)) assert.equal((await a(`/api/facts/${f.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 200)
await a('/api/conflicts/scan', { method: 'POST' })
let canon = (await a('/api/facts?status=canon')).data
const atCauseway = canon.find(f => f.predicate === 'located_at' && f.object === 'Causeway')
const atLighthouse = canon.filter(f => f.predicate === 'located_at' && f.object === 'Lighthouse')
assert.ok(atCauseway && atLighthouse.length, 'demo has Arin at Causeway and at Lighthouse')
const premise = (await a('/api/conflicts')).data.filter(c => c.status === 'open'
  && [c.left_fact_id, c.right_fact_id].includes(atCauseway.id) && [c.left, c.right].some(x => x.object === 'Lighthouse'))
check('scan raises a Causeway-vs-Lighthouse conflict', premise.length > 0, true)

// A pending proposal on the Causeway fact, analysed before the merge.
const change = (await a('/api/changes', { method: 'POST', body: { target_fact_id: atCauseway.id, proposed_statement: 'Arin waits on the Causeway at dusk.', rationale: 'probe' } })).data
const storedBefore = change.impact.length

const entities = (await a('/api/entities')).data
const lighthouse = entities.find(e => e.name === 'Lighthouse')
const causeway = entities.find(e => e.name === 'Causeway')
assert.ok(lighthouse && causeway, 'both pages exist')

const preview = (await a(`/api/entities/${lighthouse.id}/merge`, { method: 'POST', body: { into: causeway.id, preview: true } })).data
check('preview lists the conflicts that close', preview.conflicts_resolved.length, premise.length)
check('preview lists the stale proposal', preview.changes_stale.map(c => c.id).join(), change.id)
check('preview wrote nothing (Lighthouse page still there)', (await a(`/api/entities/${lighthouse.id}`)).status, 200)
check('preview wrote nothing (conflict still open)', (await a('/api/conflicts')).data.find(c => c.id === premise[0].id).status, 'open')

const merged = await a(`/api/entities/${lighthouse.id}/merge`, { method: 'POST', body: { into: causeway.id } })
check('merge succeeds', merged.status, 200)
const audit = (await a('/api/audit')).data
const mergeEvent = audit.find(e => e.event_type === 'entity.merged')
check('merge audit records the mapping', mergeEvent.detail.names_mapped.includes('Lighthouse'), true)

// 1. Stale impact blocks accept until re-run.
let stored = (await a('/api/changes')).data.find(c => c.id === change.id)
check('proposal is marked stale by the merge', stored.impact_stale?.audit_id, mergeEvent.id)
const csv = (await a(`/api/changes/${change.id}/export?format=csv`)).data.split('\n')
check('CSV export has the stale column', csv[0].startsWith('impact_stale,'), true)
check('every CSV row carries the stale warning', csv.slice(1).every(r => r.startsWith('"Out of date: a merge')), true)
const blocked = await a(`/api/changes/${change.id}/decision`, { method: 'POST', body: { decision: 'accept', rationale: 'probe' } })
check('accept on stale impact is refused', `${blocked.status} ${blocked.data.statusMessage}`, '409 IMPACT_STALE')
const rerun = (await a(`/api/changes/${change.id}/analyze`, { method: 'POST' })).data
console.log(`    impact: ${storedBefore} items before the merge, ${rerun.impact.length} after re-run`)
check('re-run picks up the merged facts', rerun.impact.length > storedBefore, true)
stored = (await a('/api/changes')).data.find(c => c.id === change.id)
check('re-run clears the stale flag', stored.impact_stale, null)
check('stored impact equals the fresh one', stored.impact.length, rerun.impact.length)
check('CSV after re-run has an empty stale column', (await a(`/api/changes/${change.id}/export?format=csv`)).data.split('\n')[1].startsWith('"",'), true)

// 2. Conflicts whose premise vanished close, with a link to the merge; a rescan does not bring them back.
const after = (await a('/api/conflicts')).data
for (const p of premise) {
  const c = after.find(x => x.id === p.id)
  check(`conflict ${p.rule} resolved by merge`, `${c.status} ${c.merge_audit_id}`, `resolved_by_merge ${mergeEvent.id}`)
}
check('conflict close is audited', audit.filter(e => e.event_type === 'conflict.resolved_by_merge').length, premise.length)
await a('/api/conflicts/scan', { method: 'POST' })
const reopened = (await a('/api/conflicts')).data.filter(c => c.status === 'open' && [c.left, c.right].some(x => names(x).includes('Lighthouse')))
check('rescan raises nothing about Lighthouse', reopened.length, 0)

// Model prompts (recorded in model_calls, mock mode too) carry the canonical subject/object and the merge, next to the
// statement and quote as written.
const lhFact = atLighthouse[0]
await a('/api/qa', { method: 'POST', body: { question: 'Where is Arin at the lighthouse?' } })
const answerCall = (await a('/api/model-calls')).data.find(c => c.purpose === 'answer')
check('answer prompt version bumped', answerCall.prompt_version, 'answer-v2')
check('answer prompt includes the re-pointed fact', answerCall.input_refs.includes(lhFact.id), true)
const lhLines = answerCall.input.split('\n[')[answerCall.input.split('\n[').findIndex(l => l.includes(`${lhFact.id}]`))]
check('answer prompt keeps the statement as written', lhLines.includes(lhFact.statement), true)
check('answer prompt gives the canonical object', /object: Causeway\b/.test(lhLines), true)
check('answer prompt explains the merge', answerCall.input.includes('"Lighthouse" is "Causeway"'), true)
const seenCalls = new Set((await a('/api/model-calls')).data.map(c => c.id))
await a('/api/conflicts/scan', { method: 'POST' })
const ruleCalls = (await a('/api/model-calls')).data.filter(c => !seenCalls.has(c.id) && c.purpose === 'rule_check')
check('rule-check prompt version bumped', ruleCalls.every(c => c.prompt_version === 'rule-check-v2'), true)
check('rule-check prompts were recorded', ruleCalls.length > 0, true)
const ruleWithLh = ruleCalls.filter(c => c.input.includes(`[${lhFact.id}]`))
check('every rule-check prompt with the re-pointed fact explains the merge', ruleWithLh.every(c => c.input.includes('"Lighthouse" is "Causeway"') && !/(subject|object): Lighthouse\b/.test(c.input)), true)
console.log(`    ${ruleWithLh.length} of ${ruleCalls.length} rule-check prompts include it`)

// Renaming the kept page is editorial: it must not change the name analysis uses for later candidates.
check('rename the Causeway page', (await a(`/api/entities/${causeway.id}`, { method: 'PATCH', body: { name: 'Old Causeway Road' } })).status, 200)

// 3. Re-importing S06 brings "Lighthouse" back as a candidate; the reviewer sees the mapping, accept saves it as Causeway.
const s06 = (await a('/api/documents')).data.find(d => d.filename === 'S06.md')
const content = (await a(`/api/documents/${s06.id}`)).data.content
const form = new FormData()
form.append('files', new Blob([`${content}\n\nRevised draft.\n`], { type: 'text/markdown' }), 'S06.md')
check('S06 re-import', (await a('/api/documents', { method: 'POST', form })).status, 200)
const cand = (await a('/api/facts?status=pending')).data.find(f => names(f).includes('Lighthouse') && f.evidence.some(e => e.verified))
assert.ok(cand, 'S06 v2 has a verified Lighthouse candidate')
check('candidate shows the merge mapping (name fixed at merge)', cand.identity.map(i => `${i.from}->${i.to} ${i.audit_id} ${i.entity_id}`).join(), `Lighthouse->Causeway ${mergeEvent.id} ${causeway.id}`)
const conflictsBefore = (await a('/api/conflicts')).data.length
check('accept the candidate', (await a(`/api/facts/${cand.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 200)
canon = (await a('/api/facts?status=canon')).data
const saved = canon.find(f => f.id === cand.id)
check('accepted fact names Causeway, not the renamed page', names(saved).includes('Causeway') && !names(saved).some(n => n === 'Lighthouse' || n === 'Old Causeway Road'), true)
check('statement kept as written', saved.statement, cand.statement)
const accAudit = (await a('/api/audit')).data.find(e => e.event_type === 'candidate.accepted' && e.target_id === cand.id)
check('accept audit records the identity', accAudit.detail.identity?.[0]?.merge_audit_id, mergeEvent.id)
await a('/api/conflicts/scan', { method: 'POST' })
const fresh = (await a('/api/conflicts')).data.slice(conflictsBefore).filter(c => [c.left_fact_id, c.right_fact_id].includes(cand.id))
check('scan raises no false conflict for the new fact', fresh.length, 0)
const change2 = (await a('/api/changes', { method: 'POST', body: { target_fact_id: atCauseway.id, proposed_statement: 'Arin waits on the Causeway at night.', rationale: 'probe' } })).data
check('impact reaches the new fact', change2.impact.some(i => i.target_id === cand.id), true)
check('no page re-filed for Lighthouse', (await a('/api/entities')).data.some(e => e.name === 'Lighthouse'), false)

// 5. Medium must be a real key.
for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty'])
  check(`medium "${bad}" refused`, (await a(`/api/projects/${project.id}`, { method: 'PATCH', body: { medium: bad } })).status, 400)
check('medium "prose" accepted', (await a(`/api/projects/${project.id}`, { method: 'PATCH', body: { medium: 'prose' } })).status, 200)
check('entity page still renders', (await a(`/api/entities/${causeway.id}`)).status, 200)
check('unknown field "constructor" refused', (await a(`/api/entities/${causeway.id}`, { method: 'PATCH', body: { fields: { constructor: 'x' } } })).status, 400)
console.log('all checks passed')
