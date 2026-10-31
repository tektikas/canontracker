// Merge identity probe against a running server: node scripts/merge-probe.mjs [baseUrl]
// Loads the demo into a throwaway account, merges Lighthouse into Causeway and asserts that everything downstream follows:
// pending change impact goes stale (CSV export says so too), conflicts whose premise vanished close, model prompts get the
// canonical names, later candidates map to the name fixed at merge time even after the kept page is renamed, a re-merge of
// the renamed page carries every earlier name along, a second merge into one page reuses its identity, and the project
// medium only accepts real keys. scripts/merge-fuzz.mjs runs the same invariants over random sequences.
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

// Accept every candidate whose quote is verified, then scan. Two get other decisions so the re-imports below can tell
// suppressed duplicates from a genuinely new candidate: the figurative "sisters" one is rejected (a decision must stand),
// and S10's Lighthouse one is accepted corrected to another predicate (so the recorded S10 candidate matches no fact).
let sisterDoc = null
const docName = async f => (await a(`/api/documents/${f.evidence[0].document_id}`)).data.filename
for (const f of (await a('/api/facts?status=pending')).data) {
  if (!f.evidence.some(e => e.verified)) continue
  if (/sisters/.test(f.statement)) {
    sisterDoc = await docName(f)
    assert.equal((await a(`/api/facts/${f.id}/review`, { method: 'POST', body: { decision: 'reject', rationale: 'probe: figurative' } })).status, 200)
  } else if (names(f).includes('Lighthouse') && f.predicate === 'located_at' && await docName(f) === 'S10.md')
    assert.equal((await a(`/api/facts/${f.id}/review`, { method: 'POST', body: { decision: 'correct_and_accept', corrected: { statement: 'Arin watches from the Lighthouse at 10:00 on Day 3.', predicate: 'watches_from' } } })).status, 200)
  else assert.equal((await a(`/api/facts/${f.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 200)
}
assert.ok(sisterDoc, 'the rejected candidate has a source document')
const reimport = async (filename, tail) => {
  const d = (await a('/api/documents')).data.filter(x => x.filename === filename).sort((x, y) => y.version - x.version)[0]
  const form = new FormData()
  form.append('files', new Blob([`${(await a(`/api/documents/${d.id}`)).data.content}\n${tail}\n`], { type: 'text/markdown' }), filename)
  assert.equal((await a('/api/documents', { method: 'POST', form })).status, 200)
}
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

// 3. Re-importing S10 brings "Lighthouse" back as a candidate; the reviewer sees the mapping, accept saves it as Causeway.
const s06 = (await a('/api/documents')).data.find(d => d.filename === 'S10.md')
const content = (await a(`/api/documents/${s06.id}`)).data.content
const form = new FormData()
form.append('files', new Blob([`${content}\n\nRevised draft.\n`], { type: 'text/markdown' }), 'S10.md')
check('S10 re-import', (await a('/api/documents', { method: 'POST', form })).status, 200)
const cand = (await a('/api/facts?status=pending')).data.find(f => names(f).includes('Lighthouse') && f.evidence.some(e => e.verified))
assert.ok(cand, 'S10 v2 has a verified Lighthouse candidate')
// Duplicates of decided facts stay out: S06's candidate equals canon under the kept name, "sisters" was rejected.
const pendingBefore = (await a('/api/facts?status=pending')).data.length
await reimport('S06.md', 'Revised draft.')
await reimport(sisterDoc, 'Revised draft.')
check('re-import suppresses canon (S06) and rejected duplicates', (await a('/api/facts?status=pending')).data.length, pendingBefore)
check('the new mapped candidate came from the changed fact only', (await a('/api/facts?status=pending')).data.filter(f => names(f).includes('Lighthouse')).length, 1)
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
// S10's beat is a real travel conflict (15 min Causeway to Harbor, canon says 40): the only one it may raise.
check('scan raises only the real travel conflict for the new fact', fresh.map(c => c.rule).join(), 'TRAVEL_TIME_TOO_SHORT')
const change2 = (await a('/api/changes', { method: 'POST', body: { target_fact_id: atCauseway.id, proposed_statement: 'Arin waits on the Causeway at night.', rationale: 'probe' } })).data
check('impact reaches the new fact', change2.impact.some(i => i.target_id === cand.id), true)
check('no page re-filed for Lighthouse', (await a('/api/entities')).data.some(e => e.name === 'Lighthouse'), false)

// Re-merge (lead c11r3 #1): the renamed page loses its Causeway alias and is merged into Salt Market. Every fact under its
// analysis name and every name merged into it before moves along; titles and hand-typed aliases play no part.
check('remove the Causeway alias', (await a(`/api/entities/${causeway.id}`, { method: 'PATCH', body: { aliases: [] } })).status, 200)
check('no page re-filed for Causeway', (await a('/api/entities')).data.filter(e => e.name === 'Causeway').length, 0)
// Client lookups (c11q #2, #3): after rename + alias removal the page still links under its analysis name and merged names;
// merged names are reported apart from hand aliases.
const listed = (await a('/api/entities')).data.find(e => e.id === causeway.id)
check('list names keep the analysis name and the merged name', ['Causeway', 'Lighthouse'].every(n => listed.names.includes(n)), true)
const pageNow = (await a(`/api/entities/${causeway.id}`)).data
check('page lists Lighthouse as merged from, not as a hand alias', `${pageNow.merged_from.join()}|${pageNow.aliases.includes('Lighthouse')}`, 'Lighthouse|false')
check('page reports its analysis name', pageNow.analysis_name, 'Causeway')
const stats = (await a('/api/stats')).data
check('stats report the last scan over current canon', stats.last_scan?.facts, stats.canon)
const market = (await a('/api/entities')).data.find(e => e.name === 'Salt Market')
const remerge = await a(`/api/entities/${causeway.id}/merge`, { method: 'POST', body: { into: market.id } })
check('re-merge into Salt Market', remerge.status, 200)
check('re-merge maps both names', remerge.data.names_mapped.sort().join(), 'Causeway,Lighthouse')
canon = (await a('/api/facts?status=canon')).data
check('no canon fact names Causeway or Lighthouse', canon.filter(f => names(f).some(n => n === 'Causeway' || n === 'Lighthouse')).length, 0)
check('re-pointed facts name Salt Market', canon.filter(f => [atCauseway.id, cand.id, ...atLighthouse.map(x => x.id)].includes(f.id)).every(f => f.object === 'Salt Market'), true)
await reimport('S10.md', 'Third draft.')
check('re-import after re-merge finds no new candidate (its mapped form is canon)', (await a('/api/facts?status=pending')).data.filter(f => names(f).includes('Lighthouse')).length, 0)
const cand3 = cand
await a('/api/conflicts/scan', { method: 'POST' })
const same = (await a('/api/conflicts')).data.filter(c => c.status === 'open' && /LOCATION|TRAVEL/.test(c.rule) && c.left.object === c.right.object)
check('no open location conflict within one place', same.length, 0)
check('no open location conflict on the new fact', (await a('/api/conflicts')).data.filter(c => c.status === 'open' && c.origin === 'rule' && c.rule !== 'TRAVEL_TIME_TOO_SHORT' && [c.left_fact_id, c.right_fact_id].includes(cand3.id)).length, 0)
const travel = (await a('/api/facts?status=canon')).data.find(f => f.predicate === 'travel_time')
const change3 = (await a('/api/changes', { method: 'POST', body: { target_fact_id: travel.id, proposed_statement: 'The trip takes an hour.', rationale: 'probe' } })).data
check('travel impact reaches the new fact', change3.impact.some(i => i.target_id === cand3.id), true)

// Second merge into the same page (lead c11r3 #2) reuses its stored identity, even after a rename and more canon under the title.
check('rename Salt Market', (await a(`/api/entities/${market.id}`, { method: 'PATCH', body: { name: 'Market Row' } })).status, 200)
const archive = (await a('/api/entities')).data.find(e => e.name === 'Old Archive')
const second = (await a(`/api/entities/${archive.id}/merge`, { method: 'POST', body: { into: market.id, preview: true } })).data
check('second merge keeps the identity', second.canonical, 'Salt Market')
check('second merge succeeds', (await a(`/api/entities/${archive.id}/merge`, { method: 'POST', body: { into: market.id } })).status, 200)
canon = (await a('/api/facts?status=canon')).data
check('no canon fact names Old Archive or Market Row', canon.filter(f => names(f).some(n => n === 'Old Archive' || n === 'Market Row')).length, 0)
check('a merged-away name cannot be reused as a page', (await a('/api/entities', { method: 'POST', body: { name: 'Lighthouse', kind: 'location' } })).status, 409)
check('the kept page may take it back as an alias', (await a(`/api/entities/${market.id}`, { method: 'PATCH', body: { aliases: ['Lighthouse'] } })).status, 200)

// 5. Medium must be a real key.
for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty'])
  check(`medium "${bad}" refused`, (await a(`/api/projects/${project.id}`, { method: 'PATCH', body: { medium: bad } })).status, 400)
check('medium "prose" accepted', (await a(`/api/projects/${project.id}`, { method: 'PATCH', body: { medium: 'prose' } })).status, 200)
check('entity page still renders', (await a(`/api/entities/${market.id}`)).status, 200)
check('unknown field "constructor" refused', (await a(`/api/entities/${market.id}`, { method: 'PATCH', body: { fields: { constructor: 'x' } } })).status, 400)
console.log('all checks passed')
