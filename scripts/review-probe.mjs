// Review probe against a running server: node scripts/review-probe.mjs [baseUrl]
// "Accept all verified" (POST /api/facts/accept-verified) on the Broken Tide demo: only pending candidates whose quote is
// verbatim in the source become canon; blocked, already decided and unknown ids are skipped and named; each accepted
// candidate gets its own audit event with the actor, plus one summary event; sending the list again accepts nothing new;
// a viewer gets 403 and another studio's ids are not found. The single-candidate review path still refuses an unverified quote.
// Each candidate goes with the fingerprint of what the sheet showed (the same shared function the page uses); if a merge, a
// new version the evidence moved to, or a newer version that left its citation stale changed one since, the whole decision is
// refused with 409, the changed ones named, and nothing is accepted.
import assert from 'node:assert/strict'
import { candidateFingerprint } from '../shared/utils/review.ts'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)

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
const items = facts => facts.map(f => ({ id: f.id, fingerprint: candidateFingerprint(f) }))
const bulk = (c, facts) => c('/api/facts/accept-verified', { method: 'POST', body: { items: items(facts) } })
const verified = f => f.evidence.some(e => e.verified)
const filesForm = (files, folder) => {
  const f = new FormData()
  for (const [name, text] of files) f.append('files', new Blob([text], { type: 'text/markdown' }), name)
  if (folder) f.append('folder_id', folder)
  return f
}

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
check('viewer: bulk accept 403', (await bulk(v, pending)).status, 403)
check('viewer: nothing changed', (await a('/api/stats')).data.canon, before.canon)

// Bad bodies.
const post = body => a('/api/facts/accept-verified', { method: 'POST', body })
check('no items: 400', (await post({})).status, 400)
check('empty items: 400', (await post({ items: [] })).status, 400)
check('ids without fingerprints: 400', (await post({ ids: pending.map(f => f.id) })).status, 400)
check('items without a fingerprint: 400', (await post({ items: pending.map(f => ({ id: f.id })) })).status, 400)

// The person rejects the figurative one first.
check('reject the “sisters” candidate', (await a(`/api/facts/${sister.id}/review`, { method: 'POST', body: { decision: 'reject', rationale: 'Figurative, not a literal relationship' } })).data.status, 'rejected')
const pendingNow = async () => (await a('/api/facts?status=pending')).data
const auditCount = async () => (await a('/api/audit')).data.length
// The sheet was opened (snapshot), then something changed; confirming must refuse everything and name exactly the changed ones.
async function refused(label, shown, change) {
  await change()
  const canonBefore = (await a('/api/stats')).data.canon
  const auditBefore = await auditCount()
  const fresh = new Map((await pendingNow()).map(f => [f.id, f]))
  const changed = shown.filter(f => candidateFingerprint(fresh.get(f.id)) !== candidateFingerprint(f)).map(f => f.id)
  const res = await bulk(a, shown)
  check(`${label}: refused with 409`, [res.status, res.data.statusMessage], [409, 'CHANGED_SINCE_SHOWN'])
  check(`${label}: names exactly the changed candidates`, [...res.data.data.changed].sort(), [...changed].sort())
  check(`${label}: nothing accepted, nothing logged`, [(await a('/api/stats')).data.canon, await auditCount() - auditBefore], [canonBefore, 0])
  return { changed, fresh }
}

// 1. A merge after the sheet opened: candidates naming Lighthouse would now be saved as Causeway.
const one = (pred) => { const f = pending.find(x => verified(x) && pred(x)); assert.ok(f); return f }
for (const f of [one(f => f.object === 'Causeway'), one(f => f.subject === 'Lighthouse')])
  assert.equal((await a(`/api/facts/${f.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 200)
let shown = (await pendingNow()).filter(verified)
const lighthouse = shown.filter(f => f.subject === 'Lighthouse' || f.object === 'Lighthouse')
check('some shown candidates name Lighthouse', lighthouse.length > 0, true)
const pages = (await a('/api/entities')).data
const page = name => pages.find(e => e.name === name)
let res = await refused('merge after the sheet opened', shown, async () => {
  assert.equal((await a(`/api/entities/${page('Lighthouse').id}/merge`, { method: 'POST', body: { into: page('Causeway').id } })).status, 200)
})
// The merge renames the moved facts (or maps the name on accept); either way they would now be saved under Causeway.
const savedAs = f => [f.subject, f.object].map(n => f.identity.find(i => i.from === n)?.to ?? n)
check('merge: the changed ones are the Lighthouse candidates, now saved under Causeway', [res.changed.sort(), lighthouse.every(f => savedAs(res.fresh.get(f.id)).includes('Causeway') && !savedAs(res.fresh.get(f.id)).includes('Lighthouse'))], [lighthouse.map(f => f.id).sort(), true])

// 2. A new version the pending evidence moved to (its quote is still there, once).
shown = (await pendingNow()).filter(verified)
const docs = (await a('/api/documents')).data
const cites = (f, doc) => f.evidence.some(e => e.verified && e.document_key === doc.filename)
const docA = docs.find(d => shown.some(f => cites(f, d)))
res = await refused('evidence moved to a new version', shown, async () => {
  const full = (await a(`/api/documents/${docA.id}`)).data
  const up = (await a('/api/documents', { method: 'POST', form: filesForm([[docA.filename.split('/').pop(), `${full.content}\n\nA line added later.\n`]], docA.folder_id) })).data.results[0]
  assert.equal(up.version, 2)
  assert.ok(up.evidence_moved > 0)
})
check('moved: the changed ones cite the new version', res.changed.length > 0 && res.changed.every(id => res.fresh.get(id).evidence.some(e => e.document_version === 2)), true)

// 3. A newer version that drops a cited quote: that citation stays on v1 and is now stale.
shown = (await pendingNow()).filter(verified)
const docB = docs.find(d => d.id !== docA.id && shown.some(f => cites(f, d)))
const target = shown.find(f => cites(f, docB))
res = await refused('source went stale', shown, async () => {
  const full = (await a(`/api/documents/${docB.id}`)).data
  const quote = target.evidence.find(e => e.verified).quote
  const up = (await a('/api/documents', { method: 'POST', form: filesForm([[docB.filename.split('/').pop(), full.content.replace(quote, 'Something else entirely.')]], docB.folder_id) })).data.results[0]
  assert.equal(up.version, 2)
})
const stale = res.fresh.get(target.id).evidence.find(e => e.verified)
check('stale: the dropped quote’s candidate is named and cites v1 of a v2 source', [res.changed.includes(target.id), stale.document_version, stale.latest_version], [true, 1, 2])

// The person reopens the sheet (fresh list) and confirms: now it goes through.
const fresh = await pendingNow()
const r = await bulk(a, [...fresh, sister, { id: 'fact_nope', evidence: [], identity: [], statement: '', subject: '', predicate: '', object: null }])
check('bulk accept: 200', r.status, 200)
const expected = fresh.filter(verified).map(f => f.id)
check('only the verified, still-pending candidates are accepted', [...r.data.accepted].sort(), [...expected].sort())
check('blocked candidates are skipped as unverified', r.data.skipped.filter(s => s.reason === 'unverified').map(s => s.id).sort(), blocked.map(f => f.id).sort())
check('the rejected one is skipped as already decided', r.data.skipped.filter(s => s.reason === 'already_decided').map(s => s.id), [sister.id])
check('an unknown id is skipped as not found', r.data.skipped.filter(s => s.reason === 'not_found').map(s => s.id), ['fact_nope'])
check('a merged candidate is saved under the kept name', (await a('/api/facts?status=canon')).data.filter(f => lighthouse.some(l => l.id === f.id)).every(f => f.subject !== 'Lighthouse' && f.object !== 'Lighthouse'), true)

const canon = new Map((await a('/api/facts?status=canon')).data.map(f => [f.id, f]))
check('every accepted candidate is canon, decided by Ada', expected.every(id => canon.get(id)?.decided_by_name === 'Ada'), true)
check('blocked candidates are still pending', (await a('/api/facts?status=pending')).data.map(f => f.id).sort(), blocked.map(f => f.id).sort())
check('canon grew by exactly the accepted count', (await a('/api/stats')).data.canon, before.canon + 2 + expected.length)

const audit = (await a('/api/audit')).data
const summary = audit.filter(e => e.event_type === 'candidate.bulk_accepted')
check('one summary event for the decision', summary.length, 1)
check('the summary names Ada and the accepted ids', [summary[0].actor_name, [...summary[0].detail.accepted].sort()], ['Ada', [...expected].sort()])
const per = audit.filter(e => e.event_type === 'candidate.accepted' && e.detail.bulk === summary[0].detail.batch)
check('one candidate.accepted event per accepted candidate', per.map(e => e.target_id).sort(), [...expected].sort())
check('each per-candidate event has the actor and the statement', per.every(e => e.actor_name === 'Ada' && e.detail.after?.statement), true)

// Sending the same list again is a no-op: nothing accepted, nothing logged.
const again = await bulk(a, fresh)
check('idempotent: nothing new accepted', [again.status, again.data.accepted.length], [200, 0])
check('idempotent: no new audit events', (await a('/api/audit')).data.length, audit.length)

// The one-by-one path still refuses a made-up quote.
check('single accept of a blocked candidate: 422', (await a(`/api/facts/${blocked[0].id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 422)

// Another studio can't reach these candidates.
const b = await account('Bea', 'Other')
const other = await bulk(b, fresh.filter(verified).slice(0, 3))
check('other studio: ids not found, nothing accepted', [other.data.accepted.length, other.data.skipped.map(s => s.reason)], [0, ['not_found', 'not_found', 'not_found']])
console.log('\nreview probe: all checks passed')
