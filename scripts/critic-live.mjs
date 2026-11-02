// Live AI critic run (not in the gate): node scripts/critic-live.mjs <recorded-mode base> <live base> [set] [--record]
// Two servers on the same database: the first runs MODEL_MODE=mock (loads the sample, so the candidates are the recorded
// extraction), the second NUXT_MODEL_MODE=meta (asks the Critic). Prints how many candidates the Critic flags, its verdicts on
// the planted beats (figurative → reject), false rejects on the planted verified facts, and latency. --record writes the
// opinions to server/assets/<set>/critic.json, the file recorded mode replays (keyed by statement).
import { writeFileSync, readFileSync } from 'node:fs'

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

const started = Date.now()
for (let i = 0; i < pending.length; i += 20) {
  const t = Date.now()
  const r = await call(liveBase, '/api/facts/critic', { ids: pending.slice(i, i + 20).map(f => f.id) })
  console.log(`  ${i + 20 > pending.length ? pending.length : i + 20}/${pending.length}: ${r.opinions} opinions on ${r.asked} asked (${r.unverified} unverified skipped) in ${((Date.now() - t) / 1000).toFixed(1)} s`)
}
const after = await call(liveBase, '/api/facts?status=pending')
const by = {}
for (const f of after) if (f.critic) by[`${f.critic.verdict}/${f.critic.reason}`] = (by[`${f.critic.verdict}/${f.critic.reason}`] ?? 0) + 1
const opinions = after.filter(f => f.critic)
const flagged = opinions.filter(f => f.critic.verdict !== 'keep')
console.log(`\nopinions: ${opinions.length}/${verified.length} verified candidates; flagged (reject or needs edit): ${flagged.length}; total ${((Date.now() - started) / 1000).toFixed(0)} s`)
console.log('by verdict/reason:', by)

const gold = JSON.parse(readFileSync(new URL(`../server/assets/${set}/gold.json`, import.meta.url), 'utf8'))
const strings = new Set()
const walk = v => (typeof v === 'string' ? strings.add(v) : v && typeof v === 'object' && Object.values(v).forEach(walk))
walk(gold)
const special = new Set([...gold.figurative, ...gold.hallucinated])
const find = s => after.find(f => f.statement === s)
for (const s of gold.figurative) console.log(`figurative  "${s}": ${find(s)?.critic ? `${find(s).critic.verdict}/${find(s).critic.reason} — ${find(s).critic.explanation}` : 'no opinion'}`)
for (const s of gold.hallucinated) console.log(`hallucinated "${s}": ${find(s)?.critic ? `${find(s).critic.verdict} (must not be keep)` : 'no opinion (unverified, never sent)'}`)
const planted = after.filter(f => strings.has(f.statement) && !special.has(f.statement))
const falseRejects = planted.filter(f => f.critic?.verdict === 'reject')
const edits = planted.filter(f => f.critic?.verdict === 'needs_edit')
console.log(`planted verified facts: ${planted.length}; false rejects: ${falseRejects.length}; needs edit: ${edits.length}`)
for (const f of [...falseRejects, ...edits]) console.log(`  ${f.critic.verdict}/${f.critic.reason}: "${f.statement}" — ${f.critic.explanation}`)
for (const f of flagged.filter(f => !planted.includes(f) && !special.has(f.statement))) console.log(`  other ${f.critic.verdict}/${f.critic.reason}: "${f.statement}" — ${f.critic.explanation}`)

if (record) {
  const out = Object.fromEntries(opinions.map(f => [f.statement, {
    verdict: f.critic.verdict, reason: f.critic.reason, explanation: f.critic.explanation, ...(f.critic.suggestion && { suggestion: f.critic.suggestion }),
  }]))
  writeFileSync(new URL(`../server/assets/${set}/critic.json`, import.meta.url), `${JSON.stringify(out, null, 1)}\n`)
  console.log(`recorded ${opinions.length} opinions to server/assets/${set}/critic.json`)
}
