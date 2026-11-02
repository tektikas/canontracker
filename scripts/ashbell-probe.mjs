// "The Ashbell Pass" demo, every planted beat, against a running recorded-mode server:
//   node scripts/ashbell-probe.mjs <baseUrl> [<server cwd>/.data/storybible.db]
// Throwaway account (unique email per run), its own project. Follows the bible's §9 live-probe steps 1–12: load (folders,
// kinds, tags, wiki pages), review (figurative reject, bulk accept skipping only the invented quote), scan (exactly C1–C5,
// M1 and the A1 false alarm), the two merges (M1 closes, M2 appears), the R1 change (impact S02/S05/S11/S13 only, tasks,
// C6 after apply, revert), the S03 v2 re-check, Ask, MCP and the gold-set evaluation. Expectations come from
// server/assets/ashbell-pass/gold.json and manifest.json, so the probe and the corpus agree by construction.
// The db path is optional: with it, the probe also checks that model_calls rows exist for every extraction and rule check.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { candidateFingerprint } from '../shared/utils/review.ts'

const base = process.argv[2] ?? 'http://localhost:3000'
const dbPath = process.argv[3]
const run = Date.now().toString(36)
const asset = f => JSON.parse(readFileSync(new URL(`../server/assets/ashbell-pass/${f}`, import.meta.url), 'utf8'))
const gold = asset('gold.json')
const manifest = asset('manifest.json')
const entitiesFile = asset('entities.json')
const candidatesFile = asset('candidates.json')
const v2Text = readFileSync(new URL('../server/assets/ashbell-pass/v2/S03-the-kettle-and-coal.md', import.meta.url), 'utf8')

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
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label} (${JSON.stringify(actual).slice(0, 110)})`) }
const sorted = a => [...a].sort()
const step = n => console.log(`\n-- step ${n}`)

const a = client()
check('sign up', (await a('/api/auth/signup', { method: 'POST', body: { name: 'Ada', email: `ada-${run}@probe.test`, password: 'correct horse' } })).status, 200)
const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Ashbell Studio' } })).data
check('create project', (await a('/api/projects', { method: 'POST', body: { name: 'The Ashbell Pass (demo)', studio_id: studio.id } })).status, 200)

// 1. Load: 28 documents in 8 folders with the manifest's kinds and tags; wiki pages preloaded; recorded candidates pending.
step(1)
const loaded = await a('/api/demo/load', { method: 'POST', body: { set: 'ashbell-pass' } })
check('load ashbell-pass', loaded.status, 200)
const stats0 = (await a('/api/stats')).data
check('recorded mode', stats0.model.mode, 'mock')
const docs = (await a('/api/documents')).data
const lib = (await a('/api/library')).data
const folderPath = id => { const f = lib.folders.find(x => x.id === id); const p = f?.parent_id && lib.folders.find(x => x.id === f.parent_id); return f ? (p ? `${p.name}/${f.name}` : f.name) : null }
const tagName = id => lib.tags.find(t => t.id === id)?.name
check('28 documents', docs.length, 28)
check('8 folders hold documents', new Set(docs.map(d => d.folder_id)).size, 8)
check('folder, kind and tags as in the manifest', Object.fromEntries(docs.map(d => [d.name, { kind: d.kind, folder: folderPath(d.folder_id), tags: sorted(d.tags.map(tagName)) }])),
  Object.fromEntries(Object.entries(manifest.docs).map(([f, m]) => [f, { kind: m.kind, folder: m.folder, tags: sorted(m.tags) }])))
check('tag colours from the manifest', Object.fromEntries(lib.tags.map(t => [t.name, t.color])), manifest.tags)
check('spoiler tag on 6 documents', lib.tags.find(t => t.name === 'spoiler').documents, 6)
const words = (await Promise.all(docs.map(async d => (await a(`/api/documents/${d.id}`)).data.content))).reduce((n, t) => n + t.split(/\s+/).filter(Boolean).length, 0)
console.log(`--  ${docs.length} documents, ${words} words as loaded`)
const entities0 = (await a('/api/entities')).data
check('wiki pages preloaded with their types (Lamplighter and Salt Gate are not)', Object.fromEntries(entities0.map(e => [e.name, e.kind])), Object.fromEntries(entitiesFile.map(e => [e.name, e.kind])))
const types = (await a('/api/entity-types')).data.map(t => t.key ?? t)
for (const k of ['character', 'npc', 'location', 'item', 'ability', 'quest', 'faction', 'event']) assert.ok(JSON.stringify(types).includes(k), `entity type ${k}`)
console.log('ok  game entity types present')
const brisk = (await a(`/api/entities/${entities0.find(e => e.name === 'Mother Brisk').id}`)).data
check('Mother Brisk has a schedule field', !!(brisk.fields ?? brisk.entity?.fields)?.schedule, true)
let pending = (await a('/api/facts?status=pending')).data
const allCandidates = Object.values(candidatesFile).flat().length
console.log(`--  ${allCandidates} recorded candidates, ${pending.length} pending (the rest repeat an earlier candidate and are skipped)`)
assert.ok(pending.length >= 250 && pending.length <= allCandidates, 'about 260 candidates pending')
check('no canon until someone decides', stats0.canon, 0)
const evLoaded = (await a('/api/audit')).data.find(e => e.event_type === 'sample.loaded')
check('sample.loaded names the set', [evLoaded.detail.set, evLoaded.detail.name, evLoaded.detail.documents], ['ashbell-pass', 'the Ashbell Pass demo', 28])

// 2. Review: reject the figurative "sisters", then accept every verified candidate in one decision.
step(2)
const byStatement = (list, s) => list.find(f => f.statement === s)
const sister = byStatement(pending, gold.figurative[0])
check('figurative candidate rejected', (await a(`/api/facts/${sister.id}/review`, { method: 'POST', body: { decision: 'reject', rationale: 'figurative: "sister of the road", no shared blood' } })).data.status, 'rejected')
const fake = byStatement(pending, gold.hallucinated[0])
check('invented quote is unverified', fake.evidence.map(e => e.verified), [0])
check('single accept of the invented quote is refused', (await a(`/api/facts/${fake.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 422)
pending = (await a('/api/facts?status=pending')).data
const unverified = pending.filter(f => !f.evidence.some(e => e.verified))
check('the S09 hallucination is the only unverified candidate', unverified.map(f => f.statement), gold.hallucinated)
const bulk = (await a('/api/facts/accept-verified', { method: 'POST', body: { items: pending.map(f => ({ id: f.id, fingerprint: candidateFingerprint(f) })) } })).data
check('bulk accept: all but one accepted, one skipped as unverified', [bulk.accepted?.length ?? bulk.accepted, bulk.skipped.map(s => [s.id, s.reason])], [pending.length - 1, [[fake.id, 'unverified']]])
let canon = (await a('/api/facts?status=canon')).data
check('canon = pending − 1', canon.length, pending.length - 1)
check('every canon fact has a verified citation', canon.every(f => f.evidence.some(e => e.verified)), true)
const fact = s => { const f = byStatement(canon, s); assert.ok(f, `canon fact: ${s}`); return f }
check('tolerant match: emphasis (evidence keeps the source characters)', fact('Whoever rings the Ashbell loses their voice until the next sunrise.').evidence[0].quote, 'Whoever rings the *Ashbell* loses their voice until the next sunrise.')
check('tolerant match: em-dash vs --', fact('Walking from the Bell Gate to Saltgate takes forty-five minutes.').evidence[0].quote, 'The walk from the Bell Gate to Saltgate takes forty-five minutes — longer in snow.')
check('tolerant match: curly vs straight', fact('Locals call Kettlehold\'s high road the Kettle\'s Spout.').evidence[0].quote, 'Locals call the high road “the Kettle’s Spout” because steam rises from every crack in it.')
check('pre-story times on the timeline', [fact('Aldous Ashdown died ringing the Ashbell on the Night of Ash.').time_label, fact('The Red Mule Caravan camps at the Foot of the Pass on Day 0.').time_label].map(l => l.replace(/\s.*/, '')), ['D-3650', 'D0'])

// 3. Scan: exactly the planted conflicts.
step(3)
check('scan', (await a('/api/conflicts/scan', { method: 'POST' })).data.model_error, null)
let conflicts = (await a('/api/conflicts')).data
const pairOf = c => sorted([c.left.statement, c.right.statement])
const find = (rule, statements) => conflicts.filter(c => c.rule === rule && JSON.stringify(pairOf(c)) === JSON.stringify(sorted(statements)))
const want = [...gold.conflicts.map(g => ({ ...g, severity: g.id === 'C4' || g.rule === 'WORLD_RULE_VIOLATION' ? 'soft' : 'hard' })),
  ...gold.false_alarms.map(g => ({ ...g, rule: 'APPROX_TIME_LOCATION_OVERLAP', severity: 'soft' }))]
for (const g of want) {
  const hit = find(g.rule, g.statements)
  check(`${g.id} ${g.rule} (${g.severity})`, hit.map(c => [c.severity, c.status]), [[g.severity, 'open']])
}
check('nothing else: 7 conflicts', conflicts.length, want.length)
check('A1 is approximate at 35%', find('APPROX_TIME_LOCATION_OVERLAP', gold.false_alarms[0].statements)[0].confidence, 0.35)
check('C5 is model-suggested and labelled', [find('WORLD_RULE_VIOLATION', gold.conflicts.find(g => g.id === 'C5').statements)[0].origin, !!find('WORLD_RULE_VIOLATION', gold.conflicts.find(g => g.id === 'C5').statements)[0].model_id], ['model', true])
check('C3 rationale quotes the travel fact', find('TRAVEL_TIME_TOO_SHORT', gold.conflicts.find(g => g.id === 'C3').statements)[0].rationale.includes('forty-five minutes'), true)
for (const pair of gold.no_conflict_pairs) check(`no conflict: ${pair.join(' / ')}`, conflicts.filter(c => JSON.stringify(pairOf(c)) === JSON.stringify(sorted(pair))).length, 0)
const calls = (await a('/api/model-calls')).data
const r2 = fact('The Ember Well grants Ashsight only to those who drink from it before dawn.')
check('R2 rule check recorded with 0 violations', calls.filter(c => c.purpose === 'rule_check' && c.target_id === r2.id).map(c => [c.status, c.output_summary]), [['ok', '0 violations']])
check('28 extraction calls, each recorded', [calls.filter(c => c.purpose === 'extract').length, calls.filter(c => c.purpose === 'extract').every(c => c.model_id === 'mock:recorded-fixtures')], [28, true])
const a1 = find('APPROX_TIME_LOCATION_OVERLAP', gold.false_alarms[0].statements)[0]
check('A1 dismissed as a false positive', (await a(`/api/conflicts/${a1.id}/decision`, { method: 'POST', body: { decision: 'false_positive', rationale: 'The Kettle & Coal stands on the edge of Saltgate; its back door opens onto the market stalls.' } })).data.status, 'false_positive')
const c4 = find('TRAVEL_TIME_TOO_SHORT', gold.conflicts.find(g => g.id === 'C4').statements)[0]
check('C4 marked uncertain', (await a(`/api/conflicts/${c4.id}/decision`, { method: 'POST', body: { decision: 'uncertain', rationale: 'Twelve minutes up the stair is close; ask design.' } })).data.status, 'uncertain')
const c1 = find('EXACT_TIME_LOCATION_OVERLAP', gold.conflicts.find(g => g.id === 'C1').statements)[0]
check('C1 confirmed', (await a(`/api/conflicts/${c1.id}/decision`, { method: 'POST', body: { decision: 'confirmed', rationale: 'Rourke cannot be on watch and drinking at once.' } })).data.status, 'confirmed')

// 4. Merge "Salt Gate" into Saltgate: M1 closes, linked to the merge.
step(4)
let entities = (await a('/api/entities')).data
const ent = name => entities.find(e => e.name === name)
assert.ok(ent('Salt Gate') && ent('Lamplighter'), 'canon filed the alias pages')
const m1 = gold.conflicts.find(g => g.id === 'M1')
const preview = (await a(`/api/entities/${ent('Salt Gate').id}/merge`, { method: 'POST', body: { into: ent('Saltgate').id, preview: true } })).data
const m1Open = find('EXACT_TIME_LOCATION_OVERLAP', m1.statements)[0]
check('merge preview shows M1 closing', preview.conflicts_resolved.map(c => c.id), [m1Open.id])
check('merge Salt Gate → Saltgate', (await a(`/api/entities/${ent('Salt Gate').id}/merge`, { method: 'POST', body: { into: ent('Saltgate').id } })).status, 200)
conflicts = (await a('/api/conflicts')).data
const m1Row = find('EXACT_TIME_LOCATION_OVERLAP', m1.statements)[0]
const mergedEvent = (await a('/api/audit')).data.find(e => e.event_type === 'entity.merged')
check('M1 resolved_by_merge, linked to entity.merged', [m1Row.status, m1Row.merge_audit_id], ['resolved_by_merge', mergedEvent.id])

// 5. Merge Lamplighter into Odo, re-scan: M2 appears.
step(5)
const m2 = gold.after_merge[0]
check('no M2 before the merge', find(m2.rule, m2.statements).length, 0)
entities = (await a('/api/entities')).data
check('merge Lamplighter → Odo', (await a(`/api/entities/${ent('Lamplighter').id}/merge`, { method: 'POST', body: { into: ent('Odo').id } })).status, 200)
await a('/api/conflicts/scan', { method: 'POST' })
conflicts = (await a('/api/conflicts')).data
check('M2 appears after the merge (hard, exact)', find(m2.rule, m2.statements).map(c => [c.severity, c.status]), [['hard', 'open']])
check('the re-scan adds only M2', conflicts.length, want.length + 1)

// 6. Propose the R1 change: impact lists S02, S05, S11, S13 and none of the excluded scenes.
step(6)
const r1 = fact('Whoever rings the Ashbell loses their voice until the next sunrise.')
const v2Rule = gold.after_change[0].rule_statement
const ch = (await a('/api/changes', { method: 'POST', body: { target_fact_id: r1.id, proposed_statement: v2Rule, rationale: 'Design wants the bell usable mid-quest; a day without a voice breaks the dialogue system.' } })).data
const fileOf = new Map(docs.map(d => [d.id, d.name]))
const scenes = ch.impact.filter(i => i.target_type === 'scene').map(i => fileOf.get(i.target_id))
check('impact scenes = expected', sorted(scenes), sorted(gold.impact.expected_scenes))
check('no excluded scene listed', gold.impact.excluded_scenes.filter(s => scenes.includes(s)), [])
check('every item has path, evidence, rationale and ≤ 2 hops', ch.impact.every(i => i.path.length >= 2 && i.evidence_ids.length > 0 && i.rationale && i.hop_count <= 2), true)
check('the pre-story Aldous fact is listed', ch.impact.some(i => i.target_type === 'fact' && i.label === 'Aldous Ashdown died ringing the Ashbell on the Night of Ash.'), true)
const exported = (await a(`/api/changes/${ch.id}/export?format=json`)).data
check('impact manifest exports', exported.items.length, ch.impact.length)

// 7. Accept: 4 re-review tasks; the re-scan adds C6 and the Corin fact against v2.
step(7)
check('accept & apply', (await a(`/api/changes/${ch.id}/decision`, { method: 'POST', body: { decision: 'accept', rationale: 'Agreed with design' } })).data.status, 'applied')
const tasks = (await a('/api/tasks')).data
check('4 open tasks, one per impacted scene', sorted(tasks.map(t => `${fileOf.get(t.document_id)}/${t.status}`)), sorted(gold.impact.expected_scenes.map(s => `${s}/open`)))
canon = (await a('/api/facts?status=canon')).data
check('R1 v2 is canon, v1 superseded and kept', [byStatement(canon, v2Rule)?.status, (await a('/api/facts?status=superseded')).data.some(f => f.id === r1.id)], ['canon', true])
await a('/api/conflicts/scan', { method: 'POST' })
conflicts = (await a('/api/conflicts')).data
for (const g of gold.after_change)
  for (const s of g.statements) check(`${g.id}: "${s.slice(0, 40)}…" against R1 v2`, find(g.rule, [g.rule_statement, s]).map(c => [c.origin, c.severity]), [['model', 'soft']])

// 8. Revert: tasks not needed, R1 v1 canon again.
step(8)
check('revert', (await a(`/api/changes/${ch.id}/revert`, { method: 'POST', body: { rationale: 'Playtest kept the sunrise rule' } })).data.status, 'reverted')
check('tasks are not_needed', [...new Set((await a('/api/tasks')).data.map(t => t.status))], ['not_needed'])
canon = (await a('/api/facts?status=canon')).data
check('R1 v1 wording is canon again (as a new version), v2 is not', [byStatement(canon, r1.statement)?.version, !!byStatement(canon, v2Rule)], [3, false])
const evTypes = (await a('/api/audit')).data.map(e => e.event_type)
check('audit shows apply and revert', ['change.applied', 'change.reverted'].map(t => evTypes.includes(t)), [true, true])

// 9. Upload S03 v2 into its folder: re-check states as designed, diff of three passages.
step(9)
const s03 = docs.find(d => d.name === gold.recheck.file)
const fd = new FormData()
fd.append('folder_id', s03.folder_id)
fd.append('files', new Blob([v2Text], { type: 'text/markdown' }), gold.recheck.file)
const up = (await a('/api/documents', { method: 'POST', form: fd })).data.results[0]
check('v2 is version 2 of the same document', [up.status, up.version, up.folder], ['imported', 2, 'Act 1 / Scenes'])
canon = (await a('/api/facts?status=canon')).data
const ev = s => fact(s).evidence.find(e => e.document_filename === gold.recheck.file)
check('(a) outdated, quote gone', [fact(gold.recheck.outdated_gone).recheck, ev(gold.recheck.outdated_gone).recheck_count], ['outdated', 0])
check('(b) outdated, appears twice', [fact(gold.recheck.outdated_twice).recheck, ev(gold.recheck.outdated_twice).recheck_count], ['outdated', 2])
for (const s of gold.recheck.unchanged) check(`unchanged: ${s}`, fact(s).recheck, 'unchanged')
const s03Facts = canon.filter(f => f.evidence.some(e => e.document_filename === gold.recheck.file))
const others = s03Facts.filter(f => ![gold.recheck.outdated_gone, gold.recheck.outdated_twice].includes(f.statement))
check('every other S03 fact unchanged', [...new Set(others.map(f => f.recheck))], ['unchanged'])
const diff = (await a(`/api/documents/${up.document_id}/diff?from=${s03.id}`)).data
check('diff: three passages changed or added', diff.counts.changed + diff.counts.added + diff.counts.removed, 3)
check('confirm the unchanged ones', sorted((await a('/api/facts/recheck', { method: 'POST', body: { action: 'confirm', fact_ids: others.map(f => f.id) } })).data.done), sorted(others.map(f => f.id)))
check('re-extracting v2 proposes nothing new', up.candidates, 0)

// 10. Ask: five grounded questions are answered from canon, two unsupported ones are unknown.
step(10)
const grounded = {
  'Who rings the Ashbell at dusk?': 'Corin rings the Ashbell at dusk on Day 1.',
  'Who does the Ember Well grant Ashsight to?': 'The Ember Well grants Ashsight only to those who drink from it before dawn.',
  'How long is the walk from the Bell Gate to Saltgate?': 'Walking from the Bell Gate to Saltgate takes forty-five minutes.',
  'Who leads the Order of the Quiet Flame?': 'Hesper Quill leads the Order of the Quiet Flame.',
  'When did Ysolde break her oath with Corin?': 'Ysolde and Corin were sworn partners until Ysolde broke the oath at 18:00 on Day 2.',
}
for (const [q, s] of Object.entries(grounded)) {
  const r = (await a('/api/qa', { method: 'POST', body: { question: q } })).data
  check(`grounded: ${q} → cites "${s.slice(0, 40)}…"`, [r.status !== 'unknown', r.cited.some(f => f.statement === s)], [true, true])
}
for (const q of gold.unknown_questions) check(`unknown: ${q}`, (await a('/api/qa', { method: 'POST', body: { question: q } })).data.status, 'unknown')

// 11. MCP: the reserved codex-factions sentence becomes an agent proposal; a sentence in no document is refused.
step(11)
const tok = (await a('/api/agent-tokens', { method: 'POST', body: { name: 'Claude Code (Ada)' } })).data
const mcp = new Client({ name: 'ashbell-probe', version: '1.0.0' })
await mcp.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${tok.secret}` } } }))
const callTool = async (name, args) => { const r = await mcp.callTool({ name, arguments: args }); return { isError: !!r.isError, data: JSON.parse(r.content[0].text) } }
const good = await callTool('sb_propose_candidate', { document: 'codex-factions.md', quote: 'The Pass Guard answers to the Abbess in matters of fire and to no one in matters of snow.', statement: 'The Pass Guard answers to the Abbess in matters of fire.', kind: 'claim', subject: 'Pass Guard', predicate: 'answers_to', object: 'Hesper' })
check('agent proposal accepted as pending', good.isError, false)
const proposed = (await a('/api/facts?status=pending')).data.find(f => f.id === good.data.fact_id)
check('pending, origin agent:mcp, for Ada', [proposed.status, proposed.origin, proposed.agent_name, proposed.proposed_by_name, proposed.evidence[0].verified], ['pending', 'agent:mcp', 'Claude Code (Ada)', 'Ada', 1])
const bad = await callTool('sb_propose_candidate', { document: 'codex-factions.md', quote: 'The Pass Guard was founded by Aldous Ashdown.', statement: 'The Pass Guard was founded by Aldous.', kind: 'claim', subject: 'Pass Guard', predicate: 'founded_by', object: 'Aldous' })
check('invented quote refused', [bad.isError, bad.data.error?.code], [true, 'QUOTE_NOT_VERBATIM'])
check('refusal audited', (await a('/api/audit')).data.some(e => e.event_type === 'agent.proposal_refused'), true)
const pack = await callTool('sb_get_context_pack', { topic: 'Ashbell' })
check('context pack on the Ashbell reads canon', [pack.isError, pack.data.facts.length > 0], [false, true])
await mcp.close()

// 12. Gold-set evaluation: every target met.
step(12)
const evalRun = (await a('/api/eval', { method: 'POST' })).data
for (const r of evalRun.results) console.log(`${r.pass === false ? 'MISS' : 'ok '} ${r.label}: ${r.measured} (target ${r.target})${r.note ? ` — ${r.note}` : ''}`)
check('eval dataset', evalRun.dataset, gold.dataset)
check('every target met', evalRun.results.filter(r => r.pass === false).map(r => r.key), [])

if (dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const project = (await a('/api/me')).data.current.project.id
  check('model_calls rows: 28 extractions, rule checks recorded', [db.prepare(`select count(*) n from model_calls where project_id = ? and purpose = 'extract'`).get(project).n >= 28,
    db.prepare(`select count(*) n from model_calls where project_id = ? and purpose = 'rule_check'`).get(project).n >= 2], [true, true])
}
console.log(`\nashbell probe passed (${docs.length} docs, ${words} words)`)
