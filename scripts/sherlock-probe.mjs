// "Sherlock Holmes" sample: Doyle's real slips found by "Same detail, two answers" (ATTRIBUTE_MISMATCH), against a running
// recorded-mode server:
//   node scripts/sherlock-probe.mjs <baseUrl> [<server cwd>/.data/storybible.db]
// Throwaway account, its own project. Follows the gold plan in server/assets/sherlock-holmes/gold.json: load (31 documents,
// folders, kinds, tags, medium prose), accept every verified candidate, scan (exactly W1, W2 and the F1 false alarm), add the
// authored facts with Add fact (N1, L1 appear; M1 waits for a merge), merge Dr. Watson into Watson (W3, W4) and Watson's wife
// into Mary (M1), check every conflict's two quotes are verbatim in their documents, MCP sb_check_facts, the export, Ask
// "unknown" and the gold-set evaluation. Expectations come from gold.json and manifest.json.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { candidateFingerprint } from '../shared/utils/review.ts'

const base = process.argv[2] ?? 'http://localhost:3000'
const dbPath = process.argv[3]
const run = Date.now().toString(36)
const asset = f => JSON.parse(readFileSync(new URL(`../server/assets/sherlock-holmes/${f}`, import.meta.url), 'utf8'))
const gold = asset('gold.json')
const manifest = asset('manifest.json')
const recorded = asset('candidates.json')
const RULE = 'ATTRIBUTE_MISMATCH'

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
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label} (${JSON.stringify(actual).slice(0, 110)})`) }
const sorted = a => [...a].sort()
const step = n => console.log(`\n-- step ${n}`)
const a = client()
check('sign up', (await a('/api/auth/signup', { method: 'POST', body: { name: 'Ada', email: `ada-${run}@probe.test`, password: 'correct horse' } })).status, 200)
const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Baker Street Studio' } })).data
check('create project', (await a('/api/projects', { method: 'POST', body: { name: 'Sherlock Holmes (sample)', studio_id: studio.id } })).status, 200)

// 1. Load: 31 documents filed by the manifest; recorded candidates pending; no canon.
step(1)
let t = Date.now()
check('load sherlock-holmes', (await a('/api/demo/load', { method: 'POST', body: { set: 'sherlock-holmes' } })).status, 200)
console.log(`--  load took ${Date.now() - t} ms`)
const stats0 = (await a('/api/stats')).data
check('recorded mode', stats0.model.mode, 'mock')
check('no canon until someone decides', stats0.canon, 0)
check('medium prose', (await a('/api/me')).data.current.project.medium, 'prose')
const docs = (await a('/api/documents')).data
const lib = (await a('/api/library')).data
const folderName = id => lib.folders.find(f => f.id === id)?.name ?? null
const tagName = id => lib.tags.find(x => x.id === id)?.name
check('31 documents', docs.length, Object.keys(manifest.docs).length)
check('folder, kind and tags as in the manifest', Object.fromEntries(docs.map(d => [d.name, { kind: d.kind, folder: folderName(d.folder_id), tags: sorted(d.tags.map(tagName)) }])),
  Object.fromEntries(Object.entries(manifest.docs).map(([f, m]) => [f, { kind: m.kind, folder: m.folder, tags: sorted(m.tags) }])))
const text = new Map()
for (const d of docs) text.set(d.name, (await a(`/api/documents/${d.id}`)).data.content)
const words = [...text.values()].reduce((n, s) => n + s.split(/\s+/).filter(Boolean).length, 0)
check('words as in the manifest', words, Object.values(manifest.docs).reduce((n, d) => n + d.words, 0))
check('no Project Gutenberg text left', [...text.values()].filter(s => /project gutenberg|gutenberg\.org|\*\*\* (START|END)/i.test(s)).length, 0)
let pending = (await a('/api/facts?status=pending')).data
const drafts = Object.entries(recorded).filter(([k]) => k !== '_note').reduce((n, [, l]) => n + l.length, 0)
console.log(`--  ${drafts} recorded candidates, ${pending.length} pending (the rest repeat an earlier candidate and are skipped)`)
assert.ok(pending.length > 1000 && pending.length <= drafts, 'about 1,100 candidates pending')
const unverified = pending.filter(f => !f.evidence.some(e => e.verified))
console.log(`--  ${unverified.length} candidates whose quote is not verbatim in its source (blocked from canon)`)

// 2. Review: accept every verified candidate (500 per decision); unverified ones are skipped and stay out of canon.
step(2)
t = Date.now()
const skipped = []
for (let i = 0; i < pending.length; i += 500) {
  const r = (await a('/api/facts/accept-verified', { method: 'POST', body: { items: pending.slice(i, i + 500).map(f => ({ id: f.id, fingerprint: candidateFingerprint(f) })) } })).data
  skipped.push(...r.skipped)
}
console.log(`--  accepted in ${Date.now() - t} ms`)
check('skipped exactly the unverified, as unverified', sorted(skipped.map(s => `${s.id}/${s.reason}`)), sorted(unverified.map(f => `${f.id}/unverified`)))
let canon = (await a('/api/facts?status=canon')).data
check('canon = pending − unverified', canon.length, pending.length - unverified.length)
check('every canon fact has a verified citation', canon.every(f => f.evidence.some(e => e.verified)), true)
const fact = s => { const f = canon.find(x => x.statement === s); assert.ok(f, `canon fact: ${s}`); return f }

// 3. Scan: exactly the slips the extraction states (W1, W2) and the F1 false alarm; every hit is rule-based and hard.
step(3)
t = Date.now()
const scan = (await a('/api/conflicts/scan', { method: 'POST' })).data
check('scan', scan.model_error, null)
console.log(`--  scan of ${canon.length} canon facts took ${Date.now() - t} ms`)
// World rules read every fact of their context, in calls of at most 120 (recorded mode: no violations for this set).
const ne = s => s?.trim().toLowerCase() || null
const isRule = f => f.kind === 'rule' && f.predicate === 'rule'
const contexts = canon.filter(isRule).map((r) => {
  const direct = canon.filter(f => f.id !== r.id && [f.subject, f.object].some(e => ne(e) === ne(r.subject)))
  const actors = new Set(direct.map(f => ne(f.subject)))
  return canon.filter(f => f.id !== r.id && !isRule(f) && (direct.includes(f) || actors.has(ne(f.subject)))).length
}).filter(Boolean)
check('world-rule checks: every context fact read, in batches of ≤ 120', scan.rule_checks,
  { rules: contexts.length, calls: contexts.reduce((n, c) => n + Math.ceil(c / 120), 0), facts: contexts.reduce((n, c) => n + c, 0) })
assert.ok(contexts.some(c => c > 120), 'a rule context over 120 facts is batched, not cut')
let conflicts = (await a('/api/conflicts')).data
const pairOf = c => sorted([c.left.statement, c.right.statement])
const find = (statements, rule = RULE) => conflicts.filter(c => c.rule === rule && JSON.stringify(pairOf(c)) === JSON.stringify(sorted(statements)))
const extracted = gold.conflicts.filter(g => g.found_by === 'extraction')
for (const g of [...extracted, ...gold.expected_false_alarms])
  check(`${g.id} ${g.rule}: ${g.statements.join(' / ')}`, find(g.statements).map(c => [c.severity, c.status, c.origin, c.confidence]), [['hard', 'open', 'rule', 0.85]])
check('nothing else', conflicts.length, extracted.length + gold.expected_false_alarms.length)
const w1 = find(extracted[0].statements)[0]
check('W1 rationale names both answers', w1.rationale, 'Watson\'s wound location is "shoulder" in one source and "leg" in the other; it can only have one answer.')
for (const pair of gold.no_conflict_pairs) check(`no conflict: ${pair.join(' / ')}`, conflicts.filter(c => JSON.stringify(pairOf(c)) === JSON.stringify(sorted(pair))).length, 0)
check('the limb answer is canon (and fits any limb)', fact('Watson has a jezail bullet wound in one of his limbs.').value, 'one of my limbs')
const f1 = find(gold.expected_false_alarms[0].statements)[0]
// Metrics: F1 still open counts against alert precision, and its "dismissed" target is not met.
const metric = (run, key) => run.results.find(r => r.key === key)
let ev = (await a('/api/eval', { method: 'POST' })).data
check('F1 open: precision 2/3, F1 not dismissed', [metric(ev, 'alert_precision').measured, metric(ev, 'alert_precision').pass, metric(ev, 'expected_false_alarms').measured, metric(ev, 'expected_false_alarms').pass],
  ['2/3 (67%)', false, '0/1 (0%)', false])
check('F1 dismissed as a false alarm', (await a(`/api/conflicts/${f1.id}/decision`, { method: 'POST', body: { decision: 'false_positive', rationale: 'A shattered shoulder leaves the arm stiff: the same wound.' } })).data.status, 'false_positive')
ev = (await a('/api/eval', { method: 'POST' })).data
check('F1 dismissed: precision 2/2, F1 target met', [metric(ev, 'alert_precision').measured, metric(ev, 'expected_false_alarms').measured, metric(ev, 'expected_false_alarms').pass], ['2/2 (100%)', '1/1 (100%)', true])
check('W1 confirmed', (await a(`/api/conflicts/${w1.id}/decision`, { method: 'POST', body: { decision: 'confirmed', rationale: 'One Jezail bullet, two places.' } })).data.status, 'confirmed')

// 4. Add fact: a reader records the details the AI did not state as a detail. The answer typed in the object box is stored
// as the detail's value (never an entity page). Scan: N1 and L1 appear; M1 waits for the merge.
step(4)
const docId = new Map(docs.map(d => [d.name, d.id]))
for (const f of gold.authored) {
  const r = await a('/api/facts', { method: 'POST', body: { to: 'canon', document_id: docId.get(f.file), quote: f.quote, statement: f.statement, kind: f.kind, subject: f.subject, predicate: f.relation, object: f.answer } })
  check(`authored: ${f.statement}`, r.status, 200)
}
canon = (await a('/api/facts?status=canon')).data
for (const f of gold.authored) check(`stored as a detail: ${f.statement}`, [fact(f.statement).predicate, fact(f.statement).object, fact(f.statement).value], [f.relation.replace(/ /g, '_'), null, f.answer])
await a('/api/conflicts/scan', { method: 'POST' })
conflicts = (await a('/api/conflicts')).data
for (const g of gold.conflicts.filter(x => x.found_by === 'authored')) check(`${g.id}: ${g.statements.join(' / ')}`, find(g.statements).map(c => [c.severity, c.status]), [['hard', 'open']])
const m1 = gold.after_merge.find(g => g.id === 'M1')
check('M1 not yet: two subjects until a person merges them', find(m1.statements).length, 0)
check('the re-scan adds only N1 and L1', conflicts.length, gold.conflicts.length + gold.expected_false_alarms.length)

// 5. Merges: Dr. Watson into Watson (W3, W4), Watson's wife into Mary (M1).
step(5)
for (const [from, into] of [['Dr. Watson', 'Watson'], ["Watson's wife", 'Mary']]) {
  const ents = (await a('/api/entities')).data
  const e = name => { const x = ents.find(y => y.name === name); assert.ok(x, `entity page ${name}`); return x }
  check(`merge ${from} → ${into}`, (await a(`/api/entities/${e(from).id}/merge`, { method: 'POST', body: { into: e(into).id } })).status, 200)
}
await a('/api/conflicts/scan', { method: 'POST' })
conflicts = (await a('/api/conflicts')).data
for (const g of gold.after_merge) check(`${g.id} after merging ${g.merge.join(' → ')}`, find(g.statements).map(c => [c.severity, c.status]), [['hard', 'open']])
for (const pair of gold.no_conflict_pairs) check(`still no conflict: ${pair.join(' / ')}`, conflicts.filter(c => JSON.stringify(pairOf(c)) === JSON.stringify(sorted(pair))).length, 0)
check('every conflict is in the gold set', sorted(conflicts.map(c => JSON.stringify(pairOf(c)))),
  sorted([...gold.conflicts, ...gold.after_merge, ...gold.expected_false_alarms].map(g => JSON.stringify(sorted(g.statements)))))

// 6. Each side of every gold conflict cites its passage with a quote that is verbatim in that document.
step(6)
canon = (await a('/api/facts?status=canon')).data
for (const g of [...gold.conflicts, ...gold.after_merge]) {
  const c = find(g.statements)[0]
  for (const side of [c.left, c.right]) {
    const f = canon.find(x => x.id === side.id)
    const ev = f.evidence.find(e => e.verified)
    assert.ok(ev && text.get(ev.document_filename).includes(ev.quote), `${g.id}: "${ev?.quote}" verbatim in ${ev?.document_filename}`)
  }
  console.log(`ok  ${g.id}: both quotes verbatim (${[c.left, c.right].map(s => canon.find(x => x.id === s.id).evidence[0].document_filename.slice(0, 30)).join(' / ')})`)
}
for (const g of [...gold.conflicts, ...gold.after_merge].filter(x => x.quotes)) {
  for (const q of g.quotes) assert.ok(text.get(q.file).split('\n')[q.line - 1].includes(q.quote.replace(/^Being a reprint from the Reminiscences of /, '')), `${g.id}: gold quote on ${q.file}:${q.line}`)
}
console.log('ok  gold.json quotes are on the lines it names')

// 7. MCP sb_check_facts: a proposed answer is checked against canon; a more precise answer ("left shoulder") is not a second one.
step(7)
const tok = (await a('/api/agent-tokens', { method: 'POST', body: { name: 'Probe' } })).data
const mcp = new Client({ name: 'sherlock-probe', version: '1.0.0' })
await mcp.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${tok.secret}` } } }))
const checkFacts = async facts => JSON.parse((await mcp.callTool({ name: 'sb_check_facts', arguments: { facts } })).content[0].text)
const knee = await checkFacts([{ kind: 'character', subject: 'Dr. Watson', predicate: 'wound_location_is', object: 'knee', statement: 'Watson was shot in the knee.' }])
check('knee: clashes with shoulder, left arm and both legs (Dr. Watson read as Watson)', sorted(knee.would_raise.filter(h => h.rule === RULE).map(h => h.right.statement ?? h.left.statement)),
  sorted(["Watson's wound was in his shoulder.", "Watson's wound is in his left arm.", 'Watson has a Jezail bullet wound in his leg.', 'Watson has a weakness in his leg.']))
const leftShoulder = await checkFacts([{ kind: 'character', subject: 'Watson', predicate: 'wound_location_is', value: 'left shoulder' }])
check('left shoulder: agrees with "shoulder", clashes with the arm and legs', leftShoulder.would_raise.filter(h => h.rule === RULE).length, 3)
await mcp.close()

// 8. Export: open conflicts carry the plain label.
step(8)
const md = (await a('/api/export/bible?format=md&sections=overview,conflicts')).data
check('export lists open conflicts as "Same detail, two answers"', typeof md === 'string' && md.includes('Same detail, two answers') && md.includes('Mrs. Turner'), true)

// 9. Ask: questions canon can't answer are "unknown".
step(9)
for (const q of gold.unknown_questions) check(`unknown: ${q}`, (await a('/api/qa', { method: 'POST', body: { question: q } })).data.status, 'unknown')

// 10. Gold-set evaluation.
step(10)
const evalRun = (await a('/api/eval', { method: 'POST' })).data
for (const r of evalRun.results) console.log(`${r.pass === false ? 'MISS' : 'ok '} ${r.label}: ${r.measured} (target ${r.target})${r.note ? ` — ${r.note}` : ''}`)
check('eval dataset', evalRun.dataset, gold.dataset)
check('every target met', evalRun.results.filter(r => r.pass === false).map(r => r.key), [])

// 11. Impact follows a detail whose answer names an entity: Watson's spouse is Mary, so a change to it reaches facts about Mary.
step(11)
check('authored: Watson is to marry Mary (spouse is → Mary)', (await a('/api/facts', { method: 'POST', body: { to: 'canon', document_id: docId.get('1890-the-sign-of-the-four-12-the-strange-story-of-jonathan-small.md'),
  quote: 'Miss Morstan has done me the honour to accept me as a husband in prospective.', statement: 'Watson is engaged to Mary.', kind: 'character', subject: 'Watson', predicate: 'spouse is', object: 'Mary' } })).status, 200)
canon = (await a('/api/facts?status=canon')).data
const spouse = fact('Watson is engaged to Mary.')
check('stored as a detail with Mary as the answer', [spouse.predicate, spouse.object, spouse.value], ['spouse_is', null, 'Mary'])
const change = (await a('/api/changes', { method: 'POST', body: { target_fact_id: spouse.id, proposed_statement: 'Watson is engaged to Mrs. Cecil Forrester.', rationale: 'probe' } })).data
const viaMary = change.impact.filter(i => i.target_type === 'fact' && i.via === 'Mary').map(i => i.label)
check('impact reaches facts about Mary through the answer', viaMary.includes("Mary's mother was dead."), true)
const mary = (await a('/api/entities')).data.find(e => e.name === 'Mary')
check('Mary\'s wiki page lists the spouse fact', (await a(`/api/entities/${mary.id}`)).data.facts.some(f => f.id === spouse.id), true)
check('reject the probe change', (await a(`/api/changes/${change.id}/decision`, { method: 'POST', body: { decision: 'reject', rationale: 'probe' } })).status, 200)

// 12. Edit & accept: the edited answer replaces the candidate's, and conflicts check the edited one (Review form and MCP).
step(12)
const proposeKnee = async (statement) => {
  const r = await a('/api/facts', { method: 'POST', body: { to: 'review', document_id: docId.get('1890-the-sign-of-the-four-01-the-science-of-deduction.md'),
    quote: 'I had a Jezail bullet through it some time before', statement, kind: 'character', subject: 'Watson', predicate: 'wound location is', object: 'knee' } })
  assert.equal(r.status, 200, JSON.stringify(r.data))
  return r.data.id
}
const editId = await proposeKnee('Watson was shot in the knee (review form).')
check('Review form: edit the answer knee → leg', (await a(`/api/facts/${editId}/review`, { method: 'POST', body: { decision: 'correct_and_accept', corrected: { object: 'leg' }, rationale: 'The text says leg.' } })).status, 200)
canon = (await a('/api/facts?status=canon')).data
check('stored answer is the edited one', [fact('Watson was shot in the knee (review form).').object, fact('Watson was shot in the knee (review form).').value], [null, 'leg'])
const full = (await a('/api/agent-tokens', { method: 'POST', body: { name: 'Probe (full)', level: 'full' } })).data
const mcp2 = new Client({ name: 'sherlock-probe-full', version: '1.0.0' })
await mcp2.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${full.secret}` } } }))
const mcpId = await proposeKnee('Watson was shot in the knee (agent).')
const r12 = await mcp2.callTool({ name: 'sb_review', arguments: { action: 'edit_accept', fact_id: mcpId, corrected: { value: 'left arm' }, rationale: 'Holmes reads the left arm.' } })
check('MCP sb_review edit_accept with a new answer', r12.isError ?? false, false)
await mcp2.close()
canon = (await a('/api/facts?status=canon')).data
check('agent-edited answer stored', fact('Watson was shot in the knee (agent).').value, 'left arm')
await a('/api/conflicts/scan', { method: 'POST' })
conflicts = (await a('/api/conflicts')).data
const about = s => conflicts.filter(c => [c.left.statement, c.right.statement].includes(s)).map(c => c.rationale)
check('conflicts read the edited answers, never "knee"', [about('Watson was shot in the knee (review form).').every(r => r.includes('"leg"')) && about('Watson was shot in the knee (review form).').length > 0,
  about('Watson was shot in the knee (agent).').every(r => r.includes('"left arm"')) && about('Watson was shot in the knee (agent).').length > 0,
  conflicts.some(c => c.rationale.includes('"knee"'))], [true, true, false])

if (dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const project = (await a('/api/me')).data.current.project.id
  check('model_calls: 31 extractions, all from the recording', { ...db.prepare(`select count(*) n, sum(model_id = 'mock:recorded-fixtures') r from model_calls where project_id = ? and purpose = 'extract'`).get(project) }, { n: 31, r: 31 })
}
console.log(`\nsherlock probe passed (${docs.length} docs, ${words} words, ${pending.length} candidates, ${unverified.length} blocked, ${canon.length} canon)`)
