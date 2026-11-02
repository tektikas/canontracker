// Day-only story time against a running server: node scripts/day-only-probe.mjs [baseUrl]
// A day-only time ("D-3650") means "some time that day": it never raises an overlap or travel conflict, while clock times
// (including a timed 00:00 - 23:59 range) and RELATIONSHIP_AFTER_END keep working on negative days.
import assert from 'node:assert/strict'
const base = process.argv[2] ?? 'http://localhost:3000'
let cookie = ''
const call = async (path, { method = 'GET', body } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const t = await res.text(); try { return { status: res.status, data: JSON.parse(t) } } catch { return { status: res.status, data: t } }
}
const run = Date.now().toString(36)
assert.equal((await call('/api/auth/signup', { method: 'POST', body: { name: 'Day', email: `day-${run}@probe.test`, password: 'correct horse' } })).status, 200)
const studio = (await call('/api/studios', { method: 'POST', body: { name: 'Day Studio' } })).data
await call('/api/projects', { method: 'POST', body: { name: 'Day Only', studio_id: studio.id } })
const text = ['# Fort', '', 'Yasar visited the Old Fort.', '', 'Yasar stood on the Wharf.', '', 'The trip between the Old Fort and the Wharf takes two hours.', '', 'Mara and Yasar were allies.', '', 'The alliance ended.', '', 'Mara and Yasar were allies again.'].join('\n')
const d = (await call('/api/drafts', { method: 'POST', body: { title: 'Fort', kind: 'scene', content: text } })).data
const doc = (await call(`/api/drafts/${d.id}/save`, { method: 'POST' })).data
let n = 0
const add = async (q, f) => { const r = await call('/api/facts', { method: 'POST', body: { document_id: doc.document_id, quote: q, to: 'canon', kind: 'event', predicate: 'located_at', statement: q + ' ' + n++, ...f } }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data }
const loc = (q, obj, from, to = '') => add(q, { subject: 'Yasar', object: obj, time_from: from, time_to: to })
const scan = async () => { await call('/api/conflicts/scan', { method: 'POST' }); return (await call('/api/conflicts')).data }
const rules = async () => { const c = await scan(); return (c.conflicts ?? c).map(x => x.rule).sort() }

await add('takes two hours', { subject: 'Old Fort', object: 'Wharf', kind: 'rule', predicate: 'travel_time', value: '120' })
await loc('Yasar visited the Old Fort', 'Old Fort', 'D-3650')
await loc('Yasar stood on the Wharf', 'Wharf', 'D-3650 14:00')
assert.deepEqual(await rules(), [], 'day-only + clock same day: no conflict')
const lab = (await call('/api/facts?status=canon')).data
console.log('labels', JSON.stringify((lab.facts ?? lab).filter(f => f.predicate === 'located_at').map(f => f.time_label)))
await loc('Yasar visited the Old Fort', 'Old Fort', 'D-3649')
assert.deepEqual(await rules(), [], 'next-day day-only: no travel/overlap conflict')
await loc('Yasar stood on the Wharf', 'Wharf', 'D-3640 23:30')
await loc('Yasar visited the Old Fort', 'Old Fort', 'D-3640 23:30')
assert.deepEqual(await rules(), ['EXACT_TIME_LOCATION_OVERLAP'], 'clock times still overlap on negative days')
await loc('Yasar stood on the Wharf', 'Wharf', 'D-3635 23:30')
await loc('Yasar visited the Old Fort', 'Old Fort', 'D-3634')
await loc('Yasar visited the Old Fort', 'Old Fort', 'D-3634 00:10')
assert.deepEqual(await rules(), ['EXACT_TIME_LOCATION_OVERLAP', 'TRAVEL_TIME_TOO_SHORT'], 'next-day clocks still checked for travel; next-day day-only is not')
await loc('Yasar stood on the Wharf', 'Wharf', 'D-3630 00:00', 'D-3630 23:59')
await loc('Yasar visited the Old Fort', 'Old Fort', 'D-3630 14:00')
assert.deepEqual((await rules()).length, 3, 'timed 00:00-23:59 range stays exact')
console.log('day-only probe ok')
