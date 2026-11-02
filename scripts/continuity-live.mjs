// Live continuity checks (not in the gate: they call the live model). Two steps on one database, because loading the Ashbell
// Pass in live mode would re-extract all 28 documents with the model:
//   1. recorded-mode server:  node scripts/continuity-live.mjs prepare http://localhost:<port>
//      (an account continuity-live@probe.test with the Ashbell Pass loaded and its verified candidates accepted)
//   2. the same database, served live:  node scripts/continuity-live.mjs run http://localhost:<port> [fixture.json]
// `run` checks three drafts and one passage of S06 and prints each report's findings and rule checks next to what is expected.
// With a fixture path it writes the recorded runs for scripts/continuity-probe.mjs (server/assets/continuity/recorded.json):
// the tool calls the model made, and its grounded findings with canon facts named by statement.
import { writeFileSync } from 'node:fs'
import { candidateFingerprint } from '../shared/utils/review.ts'

const [mode, base = 'http://localhost:3000', fixturePath] = process.argv.slice(2)
const account = { name: 'Casey', email: 'continuity-live@probe.test', password: 'correct horse' }
let cookie = ''
async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const text = await res.text()
  try {
    return { status: res.status, data: JSON.parse(text) }
  } catch {
    return { status: res.status, data: text }
  }
}

export const DRAFTS = [
  { label: 'clean', expect: { contradicts: 0, rules: [] },
    text: 'Years after the Night of Ash, Ves climbs the tower stair with Corin\'s old lantern. He taught her to read the signal fires from the tower when she was a child, and tonight she reads them alone.' },
  { label: 'time/place contradiction', expect: { contradicts: 1, rules: ['EXACT_TIME_LOCATION_OVERLAP'] },
    text: 'At 21:30 on Day 2, Captain Rourke walks the market stalls of Saltgate, haggling over a sack of salt. He does not think about the Bell Gate at all.' },
  { label: 'relationship after end', expect: { contradicts: 1, rules: ['RELATIONSHIP_AFTER_END'] },
    text: 'At 09:00 on Day 3, Ysolde waits on the Cinder Bridge for Corin, her sworn partner, and they walk up to the Bell Gate together as if nothing had happened.' },
]
const PASSAGE = { label: 'reader selection (S06)', file: 'S06-lamps-along-kiln-street.md', quote: 'At 21:30 on Day 2, Captain Rourke is drinking alone at the Kettle & Coal.', expect: { contradicts: 1, rules: ['EXACT_TIME_LOCATION_OVERLAP'] } }

if (mode === 'prepare') {
  if ((await call('/api/auth/signup', { method: 'POST', body: account })).status !== 200) throw new Error('sign up failed (run prepare once per database)')
  const studio = (await call('/api/studios', { method: 'POST', body: { name: 'Continuity Live' } })).data
  await call('/api/projects', { method: 'POST', body: { name: 'The Ashbell Pass (continuity)', studio_id: studio.id } })
  if ((await call('/api/demo/load', { method: 'POST', body: { set: 'ashbell-pass' } })).status !== 200) throw new Error('load failed')
  const pending = (await call('/api/facts?status=pending')).data
  const bulk = (await call('/api/facts/accept-verified', { method: 'POST', body: { items: pending.map(f => ({ id: f.id, fingerprint: candidateFingerprint(f) })) } })).data
  console.log(`prepared: ${bulk.accepted?.length ?? bulk.accepted} canon facts accepted, ${bulk.skipped.length} skipped`)
  process.exit(0)
}
if (mode !== 'run') throw new Error('usage: continuity-live.mjs prepare|run <base> [fixture.json]')

if ((await call('/api/auth/login', { method: 'POST', body: account })).status !== 200) throw new Error('log in failed: run prepare first')
const docs = (await call('/api/documents')).data
const doc = docs.find(d => d.filename === PASSAGE.file)
const passage = (await call(`/api/documents/${doc.id}`)).data.passages.find(p => p.text.includes(PASSAGE.quote))
const recorded = []
let misses = 0
for (const d of [...DRAFTS, PASSAGE]) {
  const t0 = Date.now()
  const res = await call('/api/continuity', { method: 'POST', body: d.quote ? { text: d.quote, passage_id: passage.id } : { text: d.text } })
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n=== ${d.label} (${secs} s, HTTP ${res.status})`)
  if (res.status !== 200) {
    misses++
    console.log(`  failed: ${res.data?.message ?? JSON.stringify(res.data).slice(0, 300)}`)
    continue
  }
  const r = res.data
  const run = (await call(`/api/agents/runs?run=${r.id}`)).data[0]
  console.log(`  ${run.model_steps} model steps, ${run.tool_calls} tool calls (${run.steps.filter(s => s.tool).map(s => s.tool).join(', ')}), ${run.tokens ?? '?'} tokens, effort ${run.effort}`)
  console.log(`  summary: ${r.summary}`)
  for (const f of r.findings) {
    console.log(`  - [${f.severity} ${f.kind}] "${f.sentence}"`)
    for (const id of f.fact_ids) console.log(`      canon ${id}: ${r.facts[id]?.statement} — "${r.facts[id]?.evidence.find(e => e.verified)?.quote}"`)
    if (f.checks.length) console.log(`      rule checks: ${f.checks.map(i => r.checks[i].rule).join(', ')}`)
    console.log(`      why: ${f.explanation}`)
    if (f.fix) console.log(`      fix: ${f.fix}`)
  }
  for (const c of r.checks) console.log(`  rule ${c.rule} (${c.severity}): ${c.rationale}`)
  for (const x of r.dropped) console.log(`  dropped "${x.sentence}": ${x.reason}`)
  const got = { contradicts: r.findings.filter(f => f.kind === 'contradicts').length, rules: [...new Set(r.checks.map(c => c.rule))].sort() }
  const ok = (got.contradicts >= 1) === (d.expect.contradicts >= 1) && d.expect.rules.every(x => got.rules.includes(x))
  if (!ok) misses++
  console.log(`  expected ${JSON.stringify(d.expect)}, got ${JSON.stringify(got)}: ${ok ? 'AS EXPECTED' : 'MISS'}`)
  if (fixturePath && (d.label === 'time/place contradiction' || d.quote)) {
    const batches = new Map()
    for (const s of run.steps.filter(s => s.tool)) batches.set(s.step, [...(batches.get(s.step) ?? []), { tool: s.tool, args: JSON.parse(s.input) }])
    recorded.push({ text: d.quote ?? d.text, steps: [...batches.values()], final: { summary: r.summary, findings: r.findings.map(({ fact_ids, checks: _, ...f }) => ({ ...f, facts: fact_ids.map(id => r.facts[id].statement) })) } })
  }
}
if (fixturePath) {
  writeFileSync(fixturePath, `${JSON.stringify(recorded, null, 2)}\n`)
  console.log(`\nwrote ${recorded.length} recorded runs to ${fixturePath}`)
}
console.log(`\n${misses ? `${misses} MISS` : 'all as expected'}`)
