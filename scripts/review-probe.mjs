// Review probe against a running server: node scripts/review-probe.mjs [baseUrl]
// "Accept all verified" (POST /api/facts/accept-verified) on the Broken Tide demo: only pending candidates whose quote is
// verbatim in the source become canon; blocked, already decided and unknown ids are skipped and named; each accepted
// candidate gets its own audit event with the actor, plus one summary event; sending the list again accepts nothing new;
// a viewer gets 403 and another studio's ids are not found. The single-candidate review path still refuses an unverified quote.
import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)

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
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label} (${JSON.stringify(actual).slice(0, 80)})`) }
async function account(name, project) {
  const c = client()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })).status, 200)
  if (project) {
    const studio = (await c('/api/studios', { method: 'POST', body: { name: `${name} Studio` } })).data
    await c('/api/projects', { method: 'POST', body: { name: project, studio_id: studio.id } })
  }
  return c
}
const bulk = (c, ids) => c('/api/facts/accept-verified', { method: 'POST', body: { ids } })
const verified = f => f.evidence.some(e => e.verified)

const a = await account('Ada', 'Broken Tide')
check('demo set loads', (await a('/api/demo/load', { method: 'POST' })).status, 200)
const pending = (await a('/api/facts?status=pending')).data
const blocked = pending.filter(f => !verified(f))
const sister = pending.find(f => /\bsisters\b/i.test(f.statement))
check('the demo has blocked candidates (quote not in the source)', blocked.length > 0, true)
check('the demo has the figurative “sisters” candidate', !!sister, true)
const before = (await a('/api/stats')).data

// A viewer can't decide, in bulk or one by one.
const link = (await a('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 1 } })).data
const v = await account('Vic')
await v(`/api/invites/${link.token}/accept`, { method: 'POST' })
await v(`/api/projects/${(await a('/api/me')).data.current.project.id}/switch`, { method: 'POST' })
check('viewer: bulk accept 403', (await bulk(v, pending.map(f => f.id))).status, 403)
check('viewer: nothing changed', (await a('/api/stats')).data.canon, before.canon)

// Bad bodies.
check('no ids: 400', (await a('/api/facts/accept-verified', { method: 'POST', body: {} })).status, 400)
check('empty ids: 400', (await bulk(a, [])).status, 400)
check('non-string ids: 400', (await bulk(a, [1, 2])).status, 400)

// The person rejects the figurative one first, then accepts the rest of the list they were shown.
check('reject the “sisters” candidate', (await a(`/api/facts/${sister.id}/review`, { method: 'POST', body: { decision: 'reject', rationale: 'Figurative, not a literal relationship' } })).data.status, 'rejected')
const r = await bulk(a, [...pending.map(f => f.id), 'fact_nope'])
check('bulk accept: 200', r.status, 200)
const expected = pending.filter(f => verified(f) && f.id !== sister.id).map(f => f.id)
check('only the verified, still-pending candidates are accepted', [...r.data.accepted].sort(), [...expected].sort())
check('blocked candidates are skipped as unverified', r.data.skipped.filter(s => s.reason === 'unverified').map(s => s.id).sort(), blocked.map(f => f.id).sort())
check('the rejected one is skipped as already decided', r.data.skipped.filter(s => s.reason === 'already_decided').map(s => s.id), [sister.id])
check('an unknown id is skipped as not found', r.data.skipped.filter(s => s.reason === 'not_found').map(s => s.id), ['fact_nope'])

const canon = new Map((await a('/api/facts?status=canon')).data.map(f => [f.id, f]))
check('every accepted candidate is canon, decided by Ada', expected.every(id => canon.get(id)?.decided_by_name === 'Ada'), true)
check('blocked candidates are still pending', (await a('/api/facts?status=pending')).data.map(f => f.id).sort(), blocked.map(f => f.id).sort())
check('canon grew by exactly the accepted count', (await a('/api/stats')).data.canon, before.canon + expected.length)

const audit = (await a('/api/audit')).data
const summary = audit.filter(e => e.event_type === 'candidate.bulk_accepted')
check('one summary event for the decision', summary.length, 1)
check('the summary names Ada and the accepted ids', [summary[0].actor_name, [...summary[0].detail.accepted].sort()], ['Ada', [...expected].sort()])
const per = audit.filter(e => e.event_type === 'candidate.accepted' && e.detail.bulk === summary[0].detail.batch)
check('one candidate.accepted event per accepted candidate', per.map(e => e.target_id).sort(), [...expected].sort())
check('each per-candidate event has the actor and the statement', per.every(e => e.actor_name === 'Ada' && e.detail.after?.statement), true)

// Sending the same list again is a no-op: nothing accepted, nothing logged.
const again = await bulk(a, pending.map(f => f.id))
check('idempotent: nothing new accepted', [again.status, again.data.accepted.length], [200, 0])
check('idempotent: no new audit events', (await a('/api/audit')).data.length, audit.length)

// The one-by-one path still refuses a made-up quote.
check('single accept of a blocked candidate: 422', (await a(`/api/facts/${blocked[0].id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 422)

// Another studio can't reach these candidates.
const b = await account('Bea', 'Other')
const other = await bulk(b, expected.slice(0, 3))
check('other studio: ids not found, nothing accepted', [other.data.accepted.length, other.data.skipped.map(s => s.reason)], [0, ['not_found', 'not_found', 'not_found']])
console.log('\nreview probe: all checks passed')
