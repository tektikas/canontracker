// Live AI critic run (not in the gate): node scripts/critic-live.mjs <recorded-mode base> <live base> [set] [--record]
// Two servers on the same database: the first runs MODEL_MODE=mock (loads the sample, so the candidates are the recorded
// extraction), the second NUXT_MODEL_MODE=meta (asks the Critic). Prints how many candidates the Critic flags, its verdicts on
// the planted beats, and latency, then runs the quality gate (scripts/critic-gold.mjs: every planted verified fact kept,
// figurative rejected, hallucinated blocked); exits 1 when it fails. --record writes the opinions to
// server/assets/<set>/critic.json (the file recorded mode replays, keyed by statement), and only from a run that passes.
import { writeFileSync } from 'node:fs'
import { goldCheck } from './critic-gold.mjs'

const [mockBase, liveBase, set = 'ashbell-pass'] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const record = process.argv.includes('--record')
if (!mockBase || !liveBase) throw new Error('usage: critic-live.mjs <mock base> <live base> [set] [--record]')
let cookie = ''
async function call(base, path, body) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(data).slice(0, 300)}`)
  return data
}
const run = Date.now().toString(36)
await call(mockBase, '/api/auth/signup', { name: 'Critic', email: `critic-${run}@probe.test`, password: 'correct horse' })
const studio = await call(mockBase, '/api/studios', { name: 'Critic Studio' })
await call(mockBase, '/api/projects', { name: `Critic ${set}`, studio_id: studio.id })
await call(mockBase, '/api/demo/load', { set })
const pending = await call(mockBase, '/api/facts?status=pending')
const verified = pending.filter(f => f.evidence.some(e => e.verified))
console.log(`${set}: ${pending.length} pending, ${verified.length} verified`)

// Four requests at a time, 20 candidates each (the server batches them by effort).
const started = Date.now()
const chunks = []
for (let i = 0; i < pending.length; i += 20) chunks.push(pending.slice(i, i + 20).map(f => f.id))
let done = 0
for (let i = 0; i < chunks.length; i += 4) {
  await Promise.all(chunks.slice(i, i + 4).map(async (ids) => {
    const t = Date.now()
    const r = await call(liveBase, '/api/facts/critic', { ids })
    done += ids.length
    console.log(`  ${done}/${pending.length}: ${r.opinions} opinions on ${r.asked} asked (${r.unverified} unverified skipped) in ${((Date.now() - t) / 1000).toFixed(1)} s`)
  }))
}
// Only opinions from this live run count (the recorded-mode load replays the shipped recordings first).
const after = (await call(liveBase, '/api/facts?status=pending')).map(f => (f.critic && Date.parse(f.critic.created_at) >= started ? f : { ...f, critic: null }))
const by = {}
for (const f of after) if (f.critic) by[`${f.critic.verdict}/${f.critic.reason}`] = (by[`${f.critic.verdict}/${f.critic.reason}`] ?? 0) + 1
const opinions = after.filter(f => f.critic)
const flagged = opinions.filter(f => f.critic.verdict !== 'keep')
const softened = opinions.filter(f => /^Suggested (a wording change only|another party)/.test(f.critic.explanation))
const calls = (await call(liveBase, '/api/model-calls')).filter(c => c.purpose === 'critic')
console.log(`\nopinions: ${opinions.length}/${verified.length} verified candidates; flagged (reject or needs edit): ${flagged.length}; wording-only or other-party edits read as keep: ${softened.length}; total ${((Date.now() - started) / 1000).toFixed(0)} s`)
console.log('by verdict/reason:', by)
const recent = calls.filter(c => Date.parse(c.created_at) >= started && !c.model_id.startsWith('mock:'))
if (recent.length) console.log(`critic calls: ${recent.length} (${recent.filter(c => c.status !== 'ok').length} failed), median ${recent.map(c => c.latency_ms).sort((a, b) => a - b)[recent.length >> 1]} ms`)
for (const c of recent.filter(c => /dropped/.test(c.output_summary ?? ''))) console.log(`  ${c.output_summary}: ${c.input_refs.join(', ')}`)
for (const f of after.filter(f => !f.critic && f.evidence.some(e => e.verified))) console.log(`  no live opinion: "${f.statement}"`)
for (const f of flagged) console.log(`  ${f.critic.verdict}/${f.critic.reason}: "${f.statement}" — ${f.critic.explanation}${f.critic.suggestion ? ` → "${f.critic.suggestion.statement}" [${f.critic.suggestion.subject} | ${f.critic.suggestion.predicate} | ${f.critic.suggestion.object ?? '-'} | ${f.critic.suggestion.time ?? '-'}] (was time ${f.time_label ?? '-'})` : ''}`)

const gate = goldCheck(set, after)
console.log(`\nquality gate: ${gate.planted} planted verified facts; ${gate.problems.length} problems`)
for (const s of gate.figurative) console.log(`  figurative ${s}`)
for (const p of gate.problems) console.log(`  FAIL ${p}`)

if (record && !gate.problems.length) {
  const out = Object.fromEntries(opinions.map(f => [f.statement, {
    verdict: f.critic.verdict, reason: f.critic.reason, explanation: f.critic.explanation, ...(f.critic.suggestion && { suggestion: f.critic.suggestion }),
  }]))
  writeFileSync(new URL(`../server/assets/${set}/critic.json`, import.meta.url), `${JSON.stringify(out, null, 1)}\n`)
  console.log(`recorded ${opinions.length} opinions to server/assets/${set}/critic.json`)
} else if (record) console.log('not recorded: the quality gate failed')
if (gate.problems.length) process.exitCode = 1
