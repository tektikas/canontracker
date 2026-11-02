// Re-check probe against a running server: node scripts/recheck-probe.mjs <baseUrl> <server cwd>/.data/storybible.db
// Broken Tide demo: accept every verified candidate of one scene and add facts from its other sentences by hand, then upload
// a v2 with two cited sentences changed. Only the two facts resting on them show "evidence outdated" (API, stats, Library row,
// upload result, audit, diff); the rest read the same and wait for one human confirmation that re-pins them to v2 (audited).
// "Keep as is" leaves a citation on v1, marked as checked against v2, until a v3 asks again; a v4 restoring a sentence makes its fact unchanged again. Viewers cannot re-check.
// A v5 repeating a confirmed quote as a new paragraph makes that fact outdated ("appears twice"), and the diff lists it though its passage reads the same.
// Keep is per citation: a fact citing two documents, both quotes gone, keeps one citation and the other stays outdated.
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'

const base = process.argv[2] ?? 'http://localhost:3000'
const dbPath = process.argv[3]
if (!dbPath) throw new Error('usage: node scripts/recheck-probe.mjs <baseUrl> <server cwd>/.data/storybible.db')
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
const count = (text, q) => text.split(q).length - 1
const sorted = a => [...a].sort()
async function account(name) {
  const c = client()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })).status, 200)
  return c
}
const form = (name, text) => {
  const f = new FormData()
  f.append('files', new Blob([text], { type: 'text/markdown' }), name)
  return f
}

const a = await account('Ada')
const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Recheck Studio' } })).data
await a('/api/projects', { method: 'POST', body: { name: 'Broken Tide', studio_id: studio.id } })
check('demo loads', (await a('/api/demo/load', { method: 'POST' })).status, 200)

// 1. Canon on one scene (the one with the most candidates): its verified candidates, accepted, plus facts a person adds from
// other sentences of it, so the scene carries a realistic amount of canon.
const quote = f => f.evidence[0].quote
const pending = (await a('/api/facts?status=pending')).data.filter(f => f.evidence.length === 1 && f.evidence[0].verified && f.evidence[0].document_kind === 'scene')
const [name, accepted] = Object.entries(Object.groupBy(pending, f => f.evidence[0].document_filename)).sort((x, y) => y[1].length - x[1].length)[0]
for (const f of accepted) assert.equal((await a(`/api/facts/${f.id}/review`, { method: 'POST', body: { decision: 'accept' } })).data.status, 'canon')
const docV1 = (await a(`/api/documents/${accepted[0].evidence[0].document_id}`)).data
// Where a quote sits in the text (each is found exactly once); two facts are independent when their spans do not touch.
const span = q => [docV1.content.indexOf(q), docV1.content.indexOf(q) + q.length]
const apart = (x, y) => x[1] <= y[0] || y[1] <= x[0]
const sentences = docV1.passages.filter(p => !p.text.startsWith('#')).flatMap(p => p.text.match(/[^.!?\n]+[.!?]/g) ?? []).map(t => t.trim())
  .filter(t => t.length >= 20 && count(docV1.content, t) === 1)
const taken = accepted.map(f => span(quote(f)))
const authored = []
for (const t of sentences) {
  if (authored.length === 3 || !taken.every(x => apart(x, span(t)))) continue
  const r = (await a('/api/facts', { method: 'POST', body: { to: 'canon', document_id: docV1.id, quote: t, kind: 'claim', subject: 'Scene', predicate: 'says', statement: `${t} (${run})` } })).data
  assert.equal(r.status, 'canon')
  taken.push(span(t))
  authored.push(r.id)
}
let canon = new Map((await a('/api/facts?status=canon')).data.map(f => [f.id, f]))
const cands = [...accepted.map(f => canon.get(f.id)), ...authored.map(id => canon.get(id))]
const ids = cands.map(f => f.id)
console.log(`--  ${name}: ${accepted.length} accepted + ${authored.length} authored canon facts`)
assert.ok(cands.every(f => count(docV1.content, quote(f)) === 1) && cands.length >= 3, 'at least 3 canon facts on the scene')
let stats = (await a('/api/stats')).data
check('nothing to re-check before a new version', [stats.recheck_outdated, stats.recheck_unchanged], [0, 0])

// 2. v2 changes two cited sentences: two facts whose quotes touch no other canon quote on the scene.
const targets = cands.filter(f => cands.every(o => o === f || apart(span(quote(f)), span(quote(o))))).slice(0, 2)
assert.equal(targets.length, 2, 'two independent quotes to change')
const changeOf = q => `${q.slice(0, Math.ceil(q.length / 2))} (revised in v2)${q.slice(Math.ceil(q.length / 2))}`
let textV2 = docV1.content
for (const f of targets) textV2 = textV2.replace(quote(f), changeOf(quote(f)))
const rest = ids.filter(id => !targets.some(t => t.id === id))
check('in v2 the targets’ quotes are gone and every other quote is there once', cands.map(f => count(textV2, quote(f))), cands.map(f => (targets.includes(f) ? 0 : 1)))
const up2 = (await a('/api/documents', { method: 'POST', form: form(name, textV2) })).data.results[0]
check('v2 imported', [up2.status, up2.version], ['imported', 2])
check('the upload says: 2 outdated of all canon on it', [up2.outdated_facts, up2.stale_facts], [2, ids.length])

// 3. Exactly the two show "evidence outdated"; the rest read the same.
canon = new Map((await a('/api/facts?status=canon')).data.map(f => [f.id, f]))
const state = id => canon.get(id).recheck
check('outdated: exactly the two facts whose sentence changed', sorted([...canon.values()].filter(f => f.recheck === 'outdated').map(f => f.id)), sorted(targets.map(t => t.id)))
check('unchanged: every other fact on the document', sorted([...canon.values()].filter(f => f.recheck === 'unchanged').map(f => f.id)), sorted(rest))
const tEv = canon.get(targets[0].id).evidence[0]
check('an outdated citation stays on v1 and points at v2 for the diff', [tEv.recheck, tEv.document_id, tEv.latest_document_id, tEv.latest_version], ['outdated', docV1.id, up2.document_id, 2])
const uEv = canon.get(rest[0]).evidence[0]
const v2doc = (await a(`/api/documents/${up2.document_id}`)).data
check('an unchanged citation knows its line in v2', [uEv.recheck, uEv.document_id, v2doc.passages.some(p => p.start_line === uEv.recheck_line && p.text.includes(uEv.quote))], ['unchanged', docV1.id, true])
stats = (await a('/api/stats')).data
check('stats: 2 outdated, the rest to confirm', [stats.recheck_outdated, stats.recheck_unchanged], [2, rest.length])
const row = async () => (await a('/api/documents')).data.find(d => d.name === name)
check('Library row: all to re-check, 2 outdated', [(await row()).stale_facts, (await row()).outdated_facts], [ids.length, 2])
const staleEv = (await a('/api/audit')).data.find(e => e.event_type === 'citation.stale' && e.target_id === up2.document_id)
check('audit citation.stale names the outdated and the unchanged', [sorted(staleEv.detail.outdated_fact_ids), sorted(staleEv.detail.unchanged_fact_ids)], [sorted(targets.map(t => t.id)), sorted(rest)])
const diff = (await a(`/api/documents/${up2.document_id}/diff?from=${docV1.id}`)).data
check('diff: the two facts on changed passages are outdated, quote gone', sorted(diff.rows.flatMap(r => r.facts).filter(f => f.outdated).map(f => f.id)), sorted(targets.map(t => t.id)))
check('diff: their quotes appear 0 times in v2', diff.rows.flatMap(r => r.facts).filter(f => f.outdated).map(f => f.quote_count), [0, 0])

// 4. A viewer reads, cannot re-check; bad requests are refused.
const link = (await a('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 1 } })).data
const v = await account('Vic')
await v(`/api/invites/${link.token}/accept`, { method: 'POST' })
await v(`/api/projects/${(await a('/api/me')).data.current.project.id}/switch`, { method: 'POST' })
check('viewer sees the outdated state', (await v('/api/facts?status=canon')).data.filter(f => f.recheck === 'outdated').length, 2)
check('viewer: confirm 403', (await v('/api/facts/recheck', { method: 'POST', body: { action: 'confirm', fact_ids: rest } })).status, 403)
check('bad action 400', (await a('/api/facts/recheck', { method: 'POST', body: { action: 'move', fact_ids: rest } })).status, 400)
check('no facts 400', (await a('/api/facts/recheck', { method: 'POST', body: { action: 'confirm', fact_ids: [] } })).status, 400)

// 5. Confirm the unchanged ones in one decision. An outdated fact sent along is skipped, not moved.
const conf = (await a('/api/facts/recheck', { method: 'POST', body: { action: 'confirm', fact_ids: [...rest, targets[0].id] } })).data
check('confirm re-pins exactly the unchanged; the outdated one is skipped', [sorted(conf.done), conf.skipped.map(s => s.id)], [sorted(rest), [targets[0].id]])
canon = new Map((await a('/api/facts?status=canon')).data.map(f => [f.id, f]))
check('confirmed facts cite v2, the passage holding their quote, and need nothing', rest.map(id => {
  const e = canon.get(id).evidence[0]
  return [e.document_id, v2doc.passages.find(p => p.id === e.passage_id)?.text.includes(e.quote), e.verified, canon.get(id).recheck]
}), rest.map(() => [up2.document_id, true, 1, null]))
check('statements unchanged', rest.map(id => canon.get(id).statement), rest.map(id => cands.find(c => c.id === id).statement))
check('outdated facts did not move', targets.map(t => canon.get(t.id).evidence[0].document_id), [docV1.id, docV1.id])
let log = (await a('/api/audit')).data
const confirmed = log.filter(e => e.event_type === 'citation.confirmed')
check('one citation.confirmed per fact, v1 → v2, by Ada', [sorted(confirmed.map(e => e.target_id)), confirmed.every(e => e.detail.citations[0].from.version === 1 && e.detail.citations[0].to.version === 2 && e.actor_name === 'Ada')], [sorted(rest), true])
check('confirming again does nothing', (await a('/api/facts/recheck', { method: 'POST', body: { action: 'confirm', fact_ids: rest } })).data.done, [])

// 6. Keep one outdated fact as it is: it stays on v1, checked against v2.
const t0ev = canon.get(targets[0].id).evidence[0].id
check('keep refuses an unchanged citation', (await a('/api/facts/recheck', { method: 'POST', body: { action: 'keep', evidence_ids: [canon.get(rest[0]).evidence[0].id] } })).data.done, [])
check('keep needs evidence_ids', (await a('/api/facts/recheck', { method: 'POST', body: { action: 'keep', fact_ids: [targets[0].id] } })).status, 400)
check('keep the first target’s citation', (await a('/api/facts/recheck', { method: 'POST', body: { action: 'keep', evidence_ids: [t0ev] } })).data.done, [t0ev])
canon = new Map((await a('/api/facts?status=canon')).data.map(f => [f.id, f]))
check('kept: still cites v1, citation marked kept, fact needs nothing', [canon.get(targets[0].id).evidence[0].document_id, canon.get(targets[0].id).evidence[0].recheck, state(targets[0].id)], [docV1.id, 'kept', null])
stats = (await a('/api/stats')).data
check('stats: 1 outdated left, nothing to confirm', [stats.recheck_outdated, stats.recheck_unchanged], [1, 0])
log = (await a('/api/audit')).data
const kept = log.find(e => e.event_type === 'citation.kept')
check('audit citation.kept: the fact, its quote, checked against v2', [kept.target_id, kept.detail.citations[0].quote, kept.detail.citations[0].checked_against.version], [targets[0].id, quote(targets[0]), 2])

// 7. v3 asks again about the kept one; the confirmed ones (now on v2) read the same in v3.
const up3 = (await a('/api/documents', { method: 'POST', form: form(name, `${textV2}\n\nA closing line added in v3.\n`) })).data.results[0]
check('v3: 2 outdated again (kept asks again), the rest unchanged', [up3.version, up3.outdated_facts, up3.stale_facts], [3, 2, ids.length])
canon = new Map((await a('/api/facts?status=canon')).data.map(f => [f.id, f]))
check('kept fact is outdated against v3', state(targets[0].id), 'outdated')
check('confirmed facts are unchanged against v3', rest.map(state), rest.map(() => 'unchanged'))

// 8. v4 restores the second target's sentence: derived on read, so that fact reads the same again.
const up4 = (await a('/api/documents', { method: 'POST', form: form(name, textV2.replace(changeOf(quote(targets[1])), quote(targets[1]))) })).data.results[0]
canon = new Map((await a('/api/facts?status=canon')).data.map(f => [f.id, f]))
check('v4: the restored sentence’s fact is unchanged, the other still outdated', [up4.version, state(targets[1].id), state(targets[0].id)], [4, 'unchanged', 'outdated'])
check('pending candidates were never touched by re-check', (await a('/api/facts?status=pending')).data.every(f => f.recheck === null), true)

// 9. v5 repeats a confirmed quote as a new paragraph. Its own passage reads the same, but the quote no longer sits in one place.
const textV4 = (await a(`/api/documents/${up4.document_id}`)).data.content
// A confirmed fact (cites v2) whose passage reads the same in v5: not the passage v4 restored.
const dup = rest.map(id => canon.get(id)).find(f => !v2doc.passages.find(p => p.id === f.evidence[0].passage_id).text.includes(changeOf(quote(targets[1]))))
check('the repeated quote is once in v4', count(textV4, quote(dup)), 1)
const up5 = (await a('/api/documents', { method: 'POST', form: form(name, `${textV4.trimEnd()}\n\n${quote(dup)}\n`) })).data.results[0]
canon = new Map((await a('/api/facts?status=canon')).data.map(f => [f.id, f]))
const dupEv = canon.get(dup.id).evidence[0]
check('v5: the repeated quote makes its fact outdated, appearing twice', [up5.version, state(dup.id), dupEv.recheck, dupEv.recheck_count], [5, 'outdated', 'outdated', 2])
check('v5: the gone quote counts 0', canon.get(targets[0].id).evidence[0].recheck_count, 0)
const diff5 = (await a(`/api/documents/${up5.document_id}/diff?from=${dupEv.document_id}`)).data
const dupRow = diff5.rows.find(r => r.facts.some(f => f.id === dup.id))
check('diff v2→v5 lists it on its unchanged passage, outdated, quote twice', [dupRow?.op, dupRow?.facts.find(f => f.id === dup.id)?.outdated, dupRow?.facts.find(f => f.id === dup.id)?.quote_count], ['same', true, 2])
check('diff v2→v5 counts it', [diff5.recheck >= 1, diff5.outdated >= 1], [true, true])

// 10. Keep is per citation. A fact citing two documents, both quotes changed: keeping one leaves the other outdated.
const docs = (await a('/api/documents')).data.filter(d => d.name !== name && d.kind === 'scene').slice(0, 2)
assert.equal(docs.length, 2, 'two other scenes')
const pick = async (d) => {
  const full = (await a(`/api/documents/${d.id}`)).data
  const t = full.passages.filter(p => !p.text.startsWith('#')).flatMap(p => p.text.match(/[^.!?\n]+[.!?]/g) ?? []).map(x => x.trim()).find(x => x.length >= 20 && count(full.content, x) === 1)
  return { full, t }
}
const [p1, p2] = [await pick(docs[0]), await pick(docs[1])]
const two = (await a('/api/facts', { method: 'POST', body: { to: 'canon', document_id: p1.full.id, quote: p1.t, kind: 'claim', subject: 'Scene', predicate: 'says', statement: `Two sources (${run})` } })).data
check('fact authored on the first scene', two.status, 'canon')
// The second citation: no route adds a second source to a fact yet, so the probe writes one evidence row the way the app
// stores it (verified, the passage holding the quote verbatim) straight into the server's database.
const passage2 = p2.full.passages.find(p => p.text.includes(p2.t))
{
  const db = new DatabaseSync(dbPath)
  db.prepare('insert into evidence (id, fact_id, document_id, passage_id, quote, verified, project_id) values (?, ?, ?, ?, ?, 1, (select project_id from facts where id = ?))')
    .run(`ev_probe${run}`, two.id, p2.full.id, passage2.id, p2.t, two.id)
  db.close()
}
for (const { full, t } of [p1, p2]) {
  const r = (await a('/api/documents', { method: 'POST', form: form(full.name ?? full.filename, full.content.replace(t, changeOf(t))) })).data.results[0]
  assert.equal(r.version, full.version + 1, `new version of ${full.filename}`)
}
let twoF = (await a('/api/facts?status=canon')).data.find(f => f.id === two.id)
check('two sources, both quotes gone: both citations outdated', twoF.evidence.map(e => [e.recheck, e.recheck_count]), [['outdated', 0], ['outdated', 0]])
const [evA, evB] = twoF.evidence.map(e => e.id)
check('keep one citation', (await a('/api/facts/recheck', { method: 'POST', body: { action: 'keep', evidence_ids: [evA] } })).data.done, [evA])
twoF = (await a('/api/facts?status=canon')).data.find(f => f.id === two.id)
check('only that citation is kept; the other is still outdated, so is the fact', [twoF.evidence.map(e => e.recheck), twoF.recheck], [['kept', 'outdated'], 'outdated'])
const keptTwo = (await a('/api/audit')).data.filter(e => e.event_type === 'citation.kept' && e.target_id === two.id)
check('one citation.kept, naming that citation only', keptTwo.map(e => e.detail.citations.map(c => c.evidence_id)), [[evA]])
check('keep the other one', (await a('/api/facts/recheck', { method: 'POST', body: { action: 'keep', evidence_ids: [evB] } })).data.done, [evB])
twoF = (await a('/api/facts?status=canon')).data.find(f => f.id === two.id)
check('both kept: the fact needs nothing; two audit events', [twoF.recheck, (await a('/api/audit')).data.filter(e => e.event_type === 'citation.kept' && e.target_id === two.id).length], [null, 2])
console.log('recheck probe: all checks passed')
