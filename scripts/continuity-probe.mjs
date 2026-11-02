// Continuity check + agent activity, against a running recorded-mode server:
//   node scripts/continuity-probe.mjs http://localhost:<port>
// Throwaway accounts, their own project with the Ashbell Pass loaded and its verified candidates accepted. The recorded runs
// (server/assets/continuity/recorded.json, recorded live by scripts/continuity-live.mjs) replay their tool calls for real in
// this project, so the rule checks are this project's own; the findings are grounded against this project's canon.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { candidateFingerprint } from '../shared/utils/review.ts'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
const recorded = JSON.parse(readFileSync(new URL('../server/assets/continuity/recorded.json', import.meta.url), 'utf8'))
const DRAFT = recorded.find(r => r.text.includes('Saltgate')).text
const PASSAGE = recorded.find(r => r.text.includes('drinking alone')).text
const WATCH = 'Captain Rourke stands watch at the Bell Gate from 21:00 to 22:00 on Day 2.'

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
async function account(name) {
  const c = client()
  check(`sign up ${name}`, (await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@continuity.test`, password: 'correct horse' } })).status, 200)
  return c
}

const a = await account('Ada')
const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Continuity Studio' } })).data
check('create project', (await a('/api/projects', { method: 'POST', body: { name: 'Ashbell (continuity probe)', studio_id: studio.id } })).status, 200)
check('load ashbell-pass', (await a('/api/demo/load', { method: 'POST', body: { set: 'ashbell-pass' } })).status, 200)
check('recorded mode', (await a('/api/stats')).data.model.mode, 'mock')
const pending = (await a('/api/facts?status=pending')).data
await a('/api/facts/accept-verified', { method: 'POST', body: { items: pending.map(f => ({ id: f.id, fingerprint: candidateFingerprint(f) })) } })
const canon = (await a('/api/facts?status=canon')).data
const watch = canon.find(f => f.statement === WATCH)
assert.ok(watch, 'the Bell Gate watch is canon')

console.log('\n-- a draft (writer): the recorded run replays its tool calls against this project')
const r1 = await a('/api/continuity', { method: 'POST', body: { text: DRAFT } })
check('check a draft', r1.status, 200)
const rep = r1.data
check('source draft, prompt continuity-v1', [rep.source, rep.prompt_version, rep.model_id], ['draft', 'continuity-v1', 'mock:recorded-fixtures'])
check('rule engine raised the exact overlap with the watch (deterministic, from sb_check_facts)',
  rep.checks.some(c => c.rule === 'EXACT_TIME_LOCATION_OVERLAP' && c.severity === 'hard' && c.fact_ids.includes(watch.id)), true)
const contra = rep.findings.find(f => f.kind === 'contradicts')
check('a hard contradiction citing the watch, linked to the rule check', [contra.severity, contra.fact_ids.includes(watch.id), contra.checks.some(i => rep.checks[i].rule === 'EXACT_TIME_LOCATION_OVERLAP')], ['hard', true, true])
check('every finding quotes the draft', rep.findings.every(f => DRAFT.includes(f.sentence)), true)
check('every cited fact is canon with a verified quote (re-read from canon)', rep.findings.flatMap(f => f.fact_ids).every(id => rep.facts[id]?.status === 'canon' && rep.facts[id].evidence.some(e => e.verified && e.quote)), true)
check('fixes are text only, never applied', typeof contra.fix, 'string')
check('a draft check can not send candidates', rep.can_propose, false)
check('nothing dropped', rep.dropped, [])

console.log('\n-- agent activity')
const trace = (await a(`/api/agents/runs?run=${rep.id}`)).data
check('one run for the check', trace.length, 1)
const t = trace[0]
check('agent, effort, status', [t.agent, t.effort, t.status, t.prompt_version], ['Continuity', 'high', 'ok', 'continuity-v1'])
check('tools called, in order', t.steps.filter(s => s.tool).map(s => s.tool), recorded.find(r => r.text === DRAFT).steps.flat().map(s => s.tool))
check('3 AI steps, 5 tool calls', [t.model_steps, t.tool_calls], [3, 5])
check('step inputs are the tool arguments', JSON.parse(t.steps.find(s => s.tool === 'sb_check_facts').input).facts[0].predicate, 'located_at')
check('nothing sent to review yet', t.outcome, { facts: {} })
const all = (await a('/api/agents/runs')).data
check('the list has the check and the extractions', [all.some(x => x.id === rep.id), all.filter(x => x.agent === 'Extractor').length > 0], [true, true])
const ext = all.find(x => x.agent === 'Extractor' && Object.keys(x.outcome.facts).length)
check('an extraction run says what people did with its candidates', Object.keys(ext.outcome.facts).includes('canon'), true)
check('only the extractor filter', (await a('/api/agents/runs?purpose=extract')).data.every(x => x.purpose === 'extract'), true)

console.log('\n-- refusals and limits')
const before = (await a('/api/agents/runs?purpose=continuity')).data.length
const off = await a('/api/continuity', { method: 'POST', body: { text: 'Ves meets Corin at the Cinder Bridge at noon on Day 5.' } })
check('a text with no recorded run: 503, says the AI is off', [off.status, off.data.statusMessage], [503, 'MODEL_OFFLINE'])
check('…and stores nothing', (await a('/api/agents/runs?purpose=continuity')).data.length, before)
check('too long: 400', (await a('/api/continuity', { method: 'POST', body: { text: 'x'.repeat(12_001) } })).status, 400)
check('empty: 400', (await a('/api/continuity', { method: 'POST', body: { text: '  ' } })).status, 400)
check('a passage id with words not in it: 422', (await a('/api/continuity', { method: 'POST', body: { text: DRAFT, passage_id: canon[0].evidence[0].passage_id } })).status, 422)
check('continuity in Research mode: 400', (await a('/api/conversations', { method: 'POST', body: { text: DRAFT, mode: 'research', action: 'continuity' } })).status, 400)

console.log('\n-- a reader selection, from Ask (Canon mode quick action)')
const docs = (await a('/api/documents')).data
const doc = (await a(`/api/documents/${docs.find(d => d.filename === 'S06-lamps-along-kiln-street.md').id}`)).data
const passage = doc.passages.find(p => p.text.includes(PASSAGE))
const conv = await a('/api/conversations', { method: 'POST', body: { text: 'Check this passage against canon.', mode: 'canon', action: 'continuity', context: [{ type: 'passage', id: passage.id, quote: PASSAGE }] } })
check('posted', conv.status, 200)
const part = conv.data.messages.at(-1).parts[0]
check('the answer is a continuity report', [part.type, !!part.report], ['continuity', true])
const pr = part.report
check('source passage of S06, can send candidates', [pr.source, pr.document_title, pr.can_propose], ['passage', doc.title, true])
check('the passage contradicts the watch (rule engine)', pr.checks.some(c => c.rule === 'EXACT_TIME_LOCATION_OVERLAP' && c.fact_ids.includes(watch.id)), true)

console.log('\n-- send a finding to review (human gate: pending only; a "new" finding of the check, from its document)')
const toReview = (r, f, extra = {}) => ({ to: 'review', continuity_id: r.id, document_id: r.document_id, passage_id: r.passage_id, quote: f.sentence, ...f.claim, ...extra })
const s06 = pr.findings.find(f => f.kind === 'contradicts')
check('a contradiction is not sent: 422', (await a('/api/facts', { method: 'POST', body: toReview(pr, s06) })).data.statusMessage, 'NOT_A_NEW_FINDING')
// The draft's text saved to the story as a written document (and again, with one more line, as another): a selection of it is a passage check.
async function written(title, content = DRAFT) {
  const d = (await a('/api/drafts', { method: 'POST', body: { title, kind: 'scene', content } })).data
  const saved = (await a(`/api/drafts/${d.id}/save`, { method: 'POST' })).data
  return (await a(`/api/documents/${saved.document_id}`)).data
}
const market = await written(`Market night ${run}`)
const copy = await written(`Market night copy ${run}`, `${DRAFT}\n\nThe stalls close at midnight.`)
const mr = (await a('/api/continuity', { method: 'POST', body: { text: DRAFT, passage_id: market.passages[0].id } })).data
const fresh = mr.findings.find(f => f.kind === 'new')
check('the passage check has a new finding and can send it', [mr.source, mr.can_propose, fresh?.fact_ids], ['passage', true, []])
check('not straight to canon', (await a('/api/facts', { method: 'POST', body: toReview(mr, fresh, { to: 'canon' }) })).status, 400)
check('the same words in another document: 422', (await a('/api/facts', { method: 'POST', body: toReview(mr, fresh, { document_id: copy.id, passage_id: copy.passages[0].id }) })).data.statusMessage, 'NOT_A_NEW_FINDING')
check('other words of that document: 422', (await a('/api/facts', { method: 'POST', body: toReview(mr, fresh, { quote: mr.findings.find(f => f.kind === 'contradicts').sentence }) })).data.statusMessage, 'NOT_A_NEW_FINDING')
const sent = await a('/api/facts', { method: 'POST', body: toReview(mr, fresh) })
check('sent: pending', [sent.status, sent.data.status], [200, 'pending'])
const cand = (await a('/api/facts?status=pending')).data.find(x => x.id === sent.data.id)
check('origin links the check; quote verified in its document', [cand.origin, cand.evidence[0].verified, cand.evidence[0].document_id, cand.evidence[0].quote], [`continuity:${mr.id}`, 1, market.id, fresh.sentence])
check('the report lists it', (await a(`/api/continuity/${mr.id}`)).data.candidates.map(c => c.id), [sent.data.id])
check('agent activity: 1 waiting in Review', (await a(`/api/agents/runs?run=${mr.id}`)).data[0].outcome, { facts: { pending: 1 } })

console.log('\n-- privacy: a draft check is the author\'s only')
const link = (await a('/api/team/invites', { method: 'POST', body: { role: 'editor', days: 1 } })).data
const e = await account('Eli')
check('editor joins', (await e(`/api/invites/${link.token}/accept`, { method: 'POST' })).status, 200)
check('editor: 404 on Ada\'s draft check', (await e(`/api/continuity/${rep.id}`)).status, 404)
check('editor: not in agent activity', (await e('/api/agents/runs?purpose=continuity')).data.map(x => x.id).includes(rep.id), false)
check('editor: not in the model-call trace', (await e('/api/model-calls')).data.some(c => c.target_id === rep.id), false)
check('editor: can\'t send it to review either', (await e('/api/facts', { method: 'POST', body: toReview(mr, fresh, { continuity_id: rep.id }) })).status, 404)
check('editor reads the shared (passage) check', (await e(`/api/continuity/${pr.id}`)).status, 200)
const vlink = (await a('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 1 } })).data
const v = await account('Vee')
check('viewer joins', (await v(`/api/invites/${vlink.token}/accept`, { method: 'POST' })).status, 200)
check('viewer: 403 on the writer\'s check', (await v('/api/continuity', { method: 'POST', body: { text: DRAFT } })).status, 403)

console.log('\n-- a reset removes the runs')
check('reload', (await a('/api/demo/load', { method: 'POST', body: { set: 'ashbell-pass' } })).status, 200)
check('the old check is gone', (await a(`/api/continuity/${pr.id}`)).status, 404)
console.log('\ncontinuity probe: all checks passed')
