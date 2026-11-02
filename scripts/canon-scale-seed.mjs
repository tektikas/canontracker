// Seeds a ~300-fact canon project through the public API, to look at Canon and its graph at a realistic size:
// node scripts/canon-scale-seed.mjs http://localhost:<port> [seed]
// A fresh account writes six chapters (one paragraph per fact), files ~70 typed entity pages, then adds every fact to canon
// from its own paragraph (POST /api/facts, verbatim quote). Prints the login to open the project in a browser.
import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://localhost:3000'
let seed = Number(process.argv[3] ?? 7)
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = a => a[Math.floor(rand() * a.length)]

let cookie = ''
async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const data = await res.json().catch(() => null)
  assert.ok(res.ok, `${method} ${path} → ${res.status} ${JSON.stringify(data)}`)
  return data
}

const FIRST = ['Arin', 'Mara', 'Leya', 'Tobin', 'Sefa', 'Corvin', 'Ilse', 'Doran', 'Petra', 'Ruan', 'Vesna', 'Halden', 'Oriel', 'Kestrel', 'Bram',
  'Nadia', 'Fen', 'Talia', 'Osric', 'Wren', 'Juno', 'Cassius', 'Ysolde', 'Marek', 'Eda', 'Lorne', 'Sabine', 'Teodor', 'Anouk', 'Gideon']
const types = {
  character: FIRST,
  location: ['the Lighthouse', 'the Causeway', 'Saltmarsh', 'the Old Harbor', 'Gull Rock', 'the Chapel', 'Ironwood', 'the Archive', 'Low Market',
    'the Tidemill', 'Northwatch', 'the Sunken Stair', 'Ember Quay', 'the Glasshouse', 'Brine Hollow'],
  item: ['the Chord-stone', 'the Brass Key', 'the Tide Ledger', 'the Grey Lantern', 'the Bone Flute', 'the Salt Crown', 'the Pilot Map', 'the Iron Bell',
    'the Wax Seal', 'the Glass Eye'],
  faction: ['the Wardens', 'the Salt Guild', 'the Lamplighters', 'the Drowned Choir', 'the Harbor Watch', 'the Ferrymen', 'the Archivists', 'the Gull Court'],
  event: ['the Long Storm', 'the Flood Night', 'the Bell Trial', 'the Lantern Fair', 'the Quiet Year', 'the Burning of Ironwood', 'the Last Ferry'],
}
const REL = [['ally_of', 'is an ally of'], ['rival_of', 'is a rival of'], ['mentor_of', 'is the mentor of'], ['sibling_of', 'is a sibling of'], ['owes_debt_to', 'owes a debt to']]

const facts = new Map()
const add = f => { const k = `${f.subject}|${f.predicate}|${f.object}`; if (f.subject !== f.object && !facts.has(k)) facts.set(k, f) }
while (facts.size < 300) {
  const r = rand()
  const c = pick(types.character)
  if (r < 0.36) { const [p, w] = pick(REL); const o = pick(types.character); add({ kind: 'relationship', subject: c, predicate: p, object: o, statement: `${c} ${w} ${o}.` }) }
  else if (r < 0.58) { const o = pick(types.location); add({ kind: 'location', subject: c, predicate: 'located_at', object: o, statement: `${c} keeps a room at ${o}.` }) }
  else if (r < 0.72) { const o = pick(types.faction); add({ kind: 'character', subject: c, predicate: 'member_of', object: o, statement: `${c} is sworn to ${o}.` }) }
  else if (r < 0.82) { const o = pick(types.item); add({ kind: 'claim', subject: c, predicate: 'carries', object: o, statement: `${c} carries ${o} everywhere.` }) }
  else if (r < 0.9) { const o = pick(types.event); add({ kind: 'event', subject: c, predicate: 'witnessed', object: o, statement: `${c} witnessed ${o} from start to end.` }) }
  else if (r < 0.95) { const s = pick(types.item); const o = pick(types.location); add({ kind: 'rule', subject: s, predicate: 'kept_in', object: o, statement: `${s} may never leave ${o}.` }) }
  else { const s = pick(types.faction); add({ kind: 'rule', subject: s, predicate: 'forbids', object: null, statement: `${s} forbid any oath sworn after dark (rule ${facts.size}).` }) }
}

const run = Date.now().toString(36)
const email = `scale-${run}@probe.test`
await call('/api/auth/signup', { method: 'POST', body: { name: 'Scale', email, password: 'correct horse' } })
const studio = await call('/api/studios', { method: 'POST', body: { name: 'Scale Studio' } })
await call('/api/projects', { method: 'POST', body: { name: 'Three hundred facts', studio_id: studio.id } })
for (const [kind, names] of Object.entries(types)) for (const name of names) await call('/api/entities', { method: 'POST', body: { name, kind } })

const list = [...facts.values()]
const CHAPTERS = 6
for (let ch = 0; ch < CHAPTERS; ch++) {
  const mine = list.filter((_, i) => i % CHAPTERS === ch)
  const title = `Chapter ${ch + 1}`
  const draft = await call('/api/drafts', { method: 'POST', body: { title, kind: 'scene', content: [`# ${title}`, ...mine.map(f => f.statement)].join('\n\n') } })
  const saved = await call(`/api/drafts/${draft.id}/save`, { method: 'POST' })
  for (const f of mine) await call('/api/facts', { method: 'POST', body: { ...f, to: 'canon', document_id: saved.document_id, quote: f.statement } })
}
const stats = await call('/api/stats')
console.log(`canon facts: ${stats.canon}`)
console.log(`log in as ${email} / correct horse`)
