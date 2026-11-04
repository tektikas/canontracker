// Guest demo probe against a running server: node scripts/guest-probe.mjs <baseUrl>
// "Try the demo" (POST /api/auth/guest): one call makes a signed-in guest with three demo projects whose canon is mostly
// preloaded sample canon (origin 'sample', nobody decided it), the gold set's review beats still pending, the conflict beats
// already listed and the rule change proposed with its impact (not decided). A normal demo load is unchanged (full queue), a
// guest has no usable password, and the route is throttled per IP. Uses fake X-Forwarded-For IPs, unique per run.
import { readFileSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
const net = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
let failures = 0
let passes = 0
function check(label, ok, detail = '') {
  if (ok) passes++
  else failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail !== '' ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`)
}
function web(ip) {
  let cookie = ''
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const text = await res.text()
    let data; try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
}
const gold = set => JSON.parse(readFileSync(new URL(`../server/assets/${set}/gold.json`, import.meta.url), 'utf8'))
const verified = f => f.evidence.some(e => e.verified)
const sameSides = (c, statements) => [c.left.statement, c.right.statement].sort().join('|') === [...statements].sort().join('|')

// 1. One click: a signed-in guest with three projects, Broken Tide open.
const g = web(`${net}.1`)
const t0 = Date.now()
const made = await g('/api/auth/guest', { method: 'POST' })
const ms = Date.now() - t0
check('guest route answers 200', made.status === 200, made.status === 200 ? `${ms} ms` : made.data)
const me = (await g('/api/me')).data
check('session works: signed in as a guest', me.user?.guest === true && me.user.name === 'Guest' && me.user.email.endsWith('@demo.invalid'), me.user)
check('three demo projects in the switcher', JSON.stringify(me.projects.map(p => p.name)) === JSON.stringify(['Broken Tide (demo)', 'The Ashbell Pass (demo)', 'Sherlock Holmes (demo)']), me.projects.map(p => p.name))
check('current project is Broken Tide', me.current?.project.name === 'Broken Tide (demo)' && me.current.role === 'owner', me.current?.project.name)
check('studio is "Demo studio"', me.studios.length === 1 && me.studios[0].name === 'Demo studio', me.studios)
const login = await web(`${net}.2`)('/api/auth/login', { method: 'POST', body: { email: me.user.email, password: 'guest' } })
check('a guest has no usable password', login.status === 401, login.status)

// 2. Each project: canon mostly preloaded, beats pending, conflicts listed, the change proposed.
const EXPECT = {
  'broken-tide': { conflicts: ['C1', 'C2', 'C3', 'C4', 'A1'], change: true },
  'ashbell-pass': { conflicts: ['C1', 'C2', 'C3', 'C4', 'C5', 'M1', 'A1'], change: true },
  'sherlock-holmes': { conflicts: ['W1'], change: false },
}
const counts = {}
for (const p of made.data.projects) {
  const want = EXPECT[p.set]
  const gs = gold(p.set)
  check(`${p.set}: switch`, (await g(`/api/projects/${p.id}/switch`, { method: 'POST' })).status === 200)
  const canon = (await g('/api/facts?status=canon')).data
  const pending = (await g('/api/facts?status=pending')).data
  const all = [...canon, ...pending, ...(await g('/api/facts?status=rejected')).data]
  check(`${p.set}: canon is over half the facts`, canon.length > all.length / 2, `${canon.length} of ${all.length}`)
  check(`${p.set}: every canon fact is preloaded sample canon, nobody decided it`, canon.every(f => f.origin === 'sample' && f.decided_by == null && f.decided_token == null && f.created_by == null && verified(f)))
  for (const s of gs.figurative ?? []) check(`${p.set}: figurative beat pending: ${s}`, pending.some(f => f.statement === s))
  for (const s of gs.hallucinated ?? []) check(`${p.set}: hallucinated beat pending and blocked: ${s}`, pending.some(f => f.statement === s && !verified(f)))
  const blocked = pending.filter(f => !verified(f))
  check(`${p.set}: a blocked candidate waits in Review`, blocked.length >= 1, blocked.length)
  const notKeep = pending.filter(f => f.critic && f.critic.verdict !== 'keep')
  // Broken Tide has 25 candidates: every one its conflict and impact beats need stays canon, so its queue is 9.
  check(`${p.set}: Review queue is a short real queue`, pending.length >= 9 && pending.length <= 40, pending.length)
  const keeps = pending.filter(f => f.critic?.verdict === 'keep')
  check(`${p.set}: held-back keeps read current (not "canon changed")`, keeps.every(f => f.critic.current && !f.critic.canon_changed), keeps.filter(f => !f.critic.current || f.critic.canon_changed).length)
  const conflicts = (await g('/api/conflicts')).data
  const beats = [...(gs.conflicts ?? []), ...(gs.false_alarms ?? [])]
  for (const id of want.conflicts) {
    const beat = beats.find(b => b.id === id)
    check(`${p.set}: conflict ${id} listed (open)`, conflicts.some(c => c.status === 'open' && sameSides(c, beat.statements)), beat.statements)
  }
  const changes = (await g('/api/changes')).data
  if (want.change) {
    const ch = changes[0]
    const docs = new Map((await g('/api/documents')).data.map(d => [d.id, d.name]))
    const scenes = (ch?.impact ?? []).filter(i => i.target_type === 'scene').map(i => docs.get(i.target_id))
    check(`${p.set}: one change proposed, pending a decision`, changes.length === 1 && ch.status === 'ready_for_review' && !ch.decided_by, changes.map(c => c.status))
    check(`${p.set}: its impact lists the expected scenes and none excluded`, gs.impact.expected_scenes.every(s => scenes.includes(s)) && !gs.impact.excluded_scenes.some(s => scenes.includes(s)), scenes)
  } else check(`${p.set}: no change proposed`, changes.length === 0)
  const audit = (await g('/api/audit')).data
  const pre = audit.find(e => e.event_type === 'sample.preloaded')
  check(`${p.set}: audited sample.preloaded with its count`, pre && JSON.parse(typeof pre.detail === 'string' ? pre.detail : JSON.stringify(pre.detail)).facts === canon.length)
  check(`${p.set}: no candidate.accepted event (no human decision faked)`, !audit.some(e => /^candidate\.(accepted|corrected_and_accepted|bulk_accepted)$/.test(e.event_type)))
  counts[p.set] = { canon: canon.length, pending: pending.length, blocked: blocked.length, critic_not_keep: notKeep.length, conflicts: conflicts.length, proposals: changes.length }
}
console.log(JSON.stringify(counts))

// 3. A normal demo load in another account still gives the full pending queue.
const n = web(`${net}.3`)
check('normal account signs up', (await n('/api/auth/signup', { method: 'POST', body: { name: 'Norma', email: `norma-${run}@probe.test`, password: 'correct horse' } })).status === 200)
const studio = (await n('/api/studios', { method: 'POST', body: { name: 'Probe studio' } })).data
await n('/api/projects', { method: 'POST', body: { name: 'Plain demo', studio_id: studio.id } })
const loaded = await n('/api/demo/load', { method: 'POST', body: { set: 'broken-tide' } })
const plain = (await n('/api/facts?status=pending')).data
check('normal demo load: no canon, all 25 candidates pending', loaded.status === 200 && plain.length === 25 && (await n('/api/facts?status=canon')).data.length === 0, `${plain.length} pending`)
check('normal demo load: no scan, no proposal', (await n('/api/conflicts')).data.length === 0 && (await n('/api/changes')).data.length === 0)
check('normal demo load: a guest body flag does nothing', (await n('/api/demo/load', { method: 'POST', body: { set: 'broken-tide', preload: true, guest: true } })).status === 200 && (await n('/api/facts?status=canon')).data.length === 0)

// 4. Throttle: 20 per 10 minutes per IP, then 429 with a plain message.
const t = web(`${net}.4`)
let last
for (let i = 0; i < 21; i++) last = await t('/api/auth/guest', { method: 'POST' })
check('the 21st guest from one IP is refused 429', last.status === 429 && /Too many demo accounts/.test(last.data.message), last.status)
check('another IP still gets one', (await web(`${net}.5`)('/api/auth/guest', { method: 'POST' })).status === 200)

console.log(`\n${passes} passed, ${failures} failed · guest route ${ms} ms`)
process.exit(failures ? 1 : 0)
