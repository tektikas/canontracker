// Live research run (not in the gate: it calls the live model with web search). Start the server in live mode, then:
//   node scripts/research-live.mjs http://localhost:<port> [label words…]
// Asks eight questions across genres (or only those whose label contains one of the given words) in a fresh project and prints, per question: kind, verdict, sources verified /
// unverified / not text-checked, calculator calls, web searches, model steps, tokens and wall time.
const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
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

// Research allows 6 runs per person every 10 minutes: a fresh account and project every 5 questions.
async function fresh(k) {
  cookie = ''
  await call('/api/auth/signup', { method: 'POST', body: { name: 'Riley', email: `riley-${run}-${k}@research.test`, password: 'correct horse' } })
  const studio = (await call('/api/studios', { method: 'POST', body: { name: 'Research Live' } })).data
  await call('/api/projects', { method: 'POST', body: { name: 'Research live run', studio_id: studio.id } })
}

const SCENE_1850 = 'London, March 1850. Inspector Hale lit a cigarette with a safety match, glanced at his wristwatch and told the constable to telephone Scotland Yard. Outside, a hansom cab waited under the gas lamps while a newsboy shouted the latest from the Crimean War.'
const QUESTIONS = [
  ['hard SF travel time', 'My ship accelerates at a constant 1 g, flips at the midpoint and decelerates. How long does it take to reach Mars at closest approach (about 78 million km)? Compare with a Hohmann transfer.'],
  ['Europa light delay', 'How far does Europa orbit from Jupiter, and what is the one-way light delay from Earth to Europa at 628 million km?'], // the probe fixture's question
  ['full moon London 1888', 'Was there a full moon over London on the night of 9 November 1888?'],
  ['horse travel 1700', 'How long would it take to ride from London to York on horseback in 1700?'],
  ['anachronism 1850', `Check this scene for anachronisms: "${SCENE_1850}"`],
  ['time of death', 'A body is found in a room at 10 °C with a rectal temperature of 28 °C. How long ago did the person die?'],
  ['follow-up case', 'How fast could the ship get there?'],
  ['unknowable case', 'What did Shakespeare eat for breakfast on the morning he wrote the first line of Hamlet?'],
]

const only = process.argv.slice(3)
const asked = QUESTIONS.filter(([label]) => !only.length || only.some(w => label.includes(w)))
let failures = 0
for (const [i, [label, question]] of asked.entries()) {
  if (i % 5 === 0) await fresh(i)
  const t0 = Date.now()
  const res = await call('/api/research', { method: 'POST', body: { question } })
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n=== ${label} (${secs} s, HTTP ${res.status})`)
  if (res.status !== 200) {
    failures++
    console.log(`  failed: ${res.data?.message ?? JSON.stringify(res.data).slice(0, 300)}`)
    continue
  }
  if (res.data.kind === 'followup') {
    console.log(`  follow-up: ${res.data.followup.question}`)
    console.log(`  options: ${(res.data.followup.options ?? []).join(' | ') || '(none)'}`)
    continue
  }
  const note = (await call(`/api/research/${res.data.noteIds[0]}`)).data
  const count = s => note.sources.filter(x => x.status === s).length
  const steps = note.trace.filter(t => (t.tool === null || t.tool === 'web_search') && t.status === 'ok')
  console.log(`  note: ${note.id}`)
  console.log(`  verdict: ${note.verdict} — ${note.why}`)
  console.log(`  answer: ${note.answer}`)
  console.log(`  sources: ${count('verified')} verified, ${count('unverified')} unverified, ${count('not_checked')} not text-checked`)
  for (const s of note.sources) console.log(`    [${s.n}] ${s.status}${s.reason ? ` (${s.reason})` : ''} ${s.url}`)
  console.log(`  claims: ${note.claims.length} (${note.claims.filter(c => c.basis === 'model').length} model knowledge, unverified)`)
  console.log(`  calculators: ${note.calculations.map(c => `${c.name}${c.error ? ' (error)' : ''}`).join(', ') || 'none'}`)
  console.log(`  web searches: ${note.searches.length}; model steps: ${steps.length}; tokens: ${note.trace.reduce((a, t) => a + (t.tokens ?? 0), 0)}`)
}
console.log(`\n${asked.length - failures}/${asked.length} questions answered without an error`)
