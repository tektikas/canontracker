// Sample-load probe against a running server: node scripts/samples-probe.mjs [baseUrl]
// To exercise overlapping loads (409), also run it against a server with NUXT_MODEL_MODE=meta: extraction then does network I/O.
// Throwaway accounts (unique emails per run). Checks that POST /api/demo/load:
// - preloads Lantern Row's canon as origin 'sample' with no human author or decider and verbatim, verified quotes;
// - rejects malformed bodies with 400 before any reset, so the project's data stays as it was; an empty body is Broken Tide;
// - never lets two overlapping loads of one project interleave (each is 200 or 409, never 404/500, and the result is whole);
// - keeps the audit trail across a reset: older events stay, a project.reset event is appended, and events whose targets the
//   reset removed are flagged target_removed (API, JSON and Markdown export); the conflict-scan tick restarts after a reset.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { candidateFingerprint } from '../shared/utils/review.ts'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)

function client() {
  let cookie = ''
  const call = async (path, { method = 'GET', body, raw } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: raw ?? (body && JSON.stringify(body)) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
  return call
}
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label} (${JSON.stringify(actual)})`) }
const sorted = a => [...a].sort()
const load = (c, body, raw) => c('/api/demo/load', { method: 'POST', body, raw })

const a = client()
check('sign up', (await a('/api/auth/signup', { method: 'POST', body: { name: 'Ada', email: `ada-${run}@probe.test`, password: 'correct horse' } })).status, 200)
const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Samples Studio' } })).data
check('create Lantern Row project', (await a('/api/projects', { method: 'POST', body: { name: 'Lantern Row (sample)', studio_id: studio.id } })).status, 200)

// 1. Sample canon is labelled as such: nobody authored or decided it, and every quote is in its passage word for word.
check('load lantern-row', (await load(a, { set: 'lantern-row' })).status, 200)
const shape = async () => {
  const s = (await a('/api/stats')).data
  return { documents: s.documents, canon: s.canon, pending: s.pending }
}
const LANTERN = { documents: 3, canon: 5, pending: 0 }
check('lantern-row shape', await shape(), LANTERN)
const canon = (await a('/api/facts?status=canon')).data
check('every sample fact has origin sample', canon.map(f => f.origin), Array(5).fill('sample'))
check('no sample fact has a human author', canon.filter(f => f.created_by || f.created_by_name).length, 0)
check('no sample fact has a human decider', canon.filter(f => f.decided_by || f.decided_by_name).length, 0)
for (const f of canon) {
  const ev = f.evidence[0]
  const doc = (await a(`/api/documents/${ev.document_id}`)).data
  const passage = doc.passages.find(p => p.id === ev.passage_id)
  assert.ok(ev.verified && passage?.text.includes(ev.quote), `quote verbatim: ${ev.quote}`)
}
console.log('ok  every sample quote is verified and verbatim in its passage')
const stats = (await a('/api/stats')).data
check('sample canon is not counted as reviewed (checklist: nothing to review)', stats.canon - stats.authored_canon + stats.rejected, 0)
let events = (await a('/api/audit')).data
check('no fact.authored event claims a person added sample canon', events.filter(e => e.event_type === 'fact.authored').length, 0)
const loaded = events.find(e => e.event_type === 'sample.loaded')
check('sample.loaded audit event counts documents and preloaded facts', [loaded?.detail.documents, loaded?.detail.facts.length], [3, 5])

// 2. Malformed bodies are refused before any reset.
for (const raw of ['{"set":', '[]', '"lantern-row"', 'null', '{"set": "nope"}']) {
  check(`malformed/invalid body ${raw} → 400`, (await load(a, undefined, raw)).status, 400)
  check(`data intact after ${raw}`, await shape(), LANTERN)
}

// 3. expect_project: a switch from another tab between the page's switch and its load must not reset the wrong project.
const projA = (await a('/api/me')).data.current.project.id
const projB = (await a('/api/projects', { method: 'POST', body: { name: 'Race B', studio_id: studio.id } })).data
check('switch to A', (await a(`/api/projects/${projA}/switch`, { method: 'POST' })).status, 200)
check('switch to B (other tab)', (await a(`/api/projects/${projB.id}/switch`, { method: 'POST' })).status, 200)
const bBefore = await shape()
check('load expecting A while B is open → 409', (await load(a, { set: 'lantern-row', expect_project: projA })).status, 409)
check('B untouched by the refused load', await shape(), bBefore)
check('switch back to A', (await a(`/api/projects/${projA}/switch`, { method: 'POST' })).status, 200)

// 6. Audit survives a reset. Scan first so there are conflict rows and a scan tick that the reset removes.
const scan = (await a('/api/conflicts/scan', { method: 'POST' }))
check('scan canon', scan.status, 200)
const conflictIds = (await a('/api/conflicts')).data.map(c => c.id)
check('the planted conflict is found', conflictIds.length >= 1, true)
check('scan ticks the checklist', !!(await a('/api/stats')).data.last_scan, true)
const before = (await a('/api/audit')).data
check('reload lantern-row', (await load(a, { set: 'lantern-row' })).status, 200)
events = (await a('/api/audit')).data
const ids = new Set(events.map(e => e.id))
check('every earlier audit event is kept', before.filter(e => !ids.has(e.id)).length, 0)
check('a project.reset event is appended', events.filter(e => e.event_type === 'project.reset').length, 2)
const resetAt = events.findIndex(e => e.event_type === 'project.reset') // newest first
const older = events.slice(resetAt + 1)
check('older conflict events point at removed targets', older.filter(e => conflictIds.includes(e.target_id)).every(e => e.target_removed), true)
check('older fact/document events are flagged removed', older.filter(e => ['fact', 'document', 'conflict'].includes(e.target_type)).every(e => e.target_removed), true)
check('newer events are not flagged', events.slice(0, resetAt).some(e => e.target_removed), false)
check('the reset clears the scan tick', (await a('/api/stats')).data.last_scan, null)
check('data after reload', await shape(), LANTERN)
const json = (await a('/api/audit/export?format=json')).data
check('JSON export keeps the old events, flagged', json.events.filter(e => e.target_removed).length, older.filter(e => e.target_removed).length)
const md = (await a('/api/audit/export?format=md')).data
check('Markdown export marks removed targets', md.includes('(removed by reset)'), true)

// 3. Overlapping loads of one project: each is 200 or 409, never a 404/500, and the project ends up whole.
for (let i = 1; i <= 5; i++) {
  const statuses = (await Promise.all([load(a, { set: 'lantern-row' }), load(a, { set: 'lantern-row' }), load(a, { set: 'lantern-row' })])).map(r => r.status)
  assert.ok(statuses.every(s => s === 200 || s === 409) && statuses.includes(200), `trial ${i}: ${statuses}`)
  check(`concurrent trial ${i} (${statuses.join('/')}) leaves a whole sample`, await shape(), LANTERN)
}

// An empty body still means Broken Tide (in its own project, so Lantern Row is untouched).
check('create Broken Tide project', (await a('/api/projects', { method: 'POST', body: { name: 'Broken Tide (demo)', studio_id: studio.id } })).status, 200)
check('empty body loads broken-tide', (await load(a)).status, 200)
const bt = (await a('/api/stats')).data
check('broken-tide documents', bt.documents, 13)
const recorded = bt.model.mode === 'mock'
check('broken-tide has no canon until someone decides', bt.canon, 0)
if (recorded) check('broken-tide candidates wait for review', bt.pending > 0, true)
// Broken Tide is the longer load (13 imports), so overlapping requests do meet here: the losers get 409, never a broken project.
let refused = 0
for (let i = 1; i <= 5; i++) {
  const statuses = (await Promise.all(Array.from({ length: 4 }, () => load(a)))).map(r => r.status)
  assert.ok(statuses.every(s => s === 200 || s === 409) && statuses.includes(200), `broken-tide trial ${i}: ${statuses}`)
  refused += statuses.filter(s => s === 409).length
  const s = (await a('/api/stats')).data
  check(`broken-tide concurrent trial ${i} (${statuses.join('/')}) leaves a whole demo`, [s.documents, s.pending, s.canon], [13, bt.pending, 0])
}
// Recorded mode imports with no I/O between awaits, so requests finish before the next one starts. Against a meta-mode server
// (real network calls during extraction) they do overlap, and this is where the 409 path is exercised.
if (recorded) console.log(`note: recorded mode, loads did not overlap (${refused} refused); run against a meta-mode server to exercise 409`)
else check('overlapping loads were refused at least once', refused > 0, true)

// The Ashbell Pass: 28 documents filed in 8 folders with kinds and tags, preloaded wiki pages, recorded candidates, no canon.
// Its beats are proven by scripts/ashbell-probe.mjs; here only that the set loads into its own project and leaves the others alone.
check('create Ashbell project', (await a('/api/projects', { method: 'POST', body: { name: 'The Ashbell Pass (demo)', studio_id: studio.id } })).status, 200)
check('load ashbell-pass', (await load(a, { set: 'ashbell-pass' })).status, 200)
const ab = (await a('/api/stats')).data
check('ashbell-pass documents, no canon', [ab.documents, ab.canon], [28, 0])
if (recorded) check('ashbell-pass candidates wait for review', ab.pending > 0, true)
const abDocs = (await a('/api/documents')).data
check('ashbell-pass documents sit in 8 folders, quests and dialogue keep their kinds', [new Set(abDocs.map(d => d.folder_id)).size, abDocs.filter(d => d.kind === 'quest').length, abDocs.filter(d => d.kind === 'dialogue').length], [8, 3, 3])
check('ashbell-pass wiki pages preloaded', (await a('/api/entities')).data.length >= 30, true)
check('ashbell-pass audit names the set', (await a('/api/audit')).data.find(e => e.event_type === 'sample.loaded').detail.set, 'ashbell-pass')
const btRow = (await a('/api/projects')).data.projects.find(p => p.name === 'Broken Tide (demo)')
check('Broken Tide project untouched', [btRow.documents, btRow.pending, btRow.canon], [13, bt.pending, 0])

// The Oz books and Alice: public-domain chapters filed by their manifests, preloaded wiki pages, a cover, the recorded Muse
// candidates (recorded mode); accept every verified one and scan. Expected counts come from the set's own files, and in
// recorded mode the review queue and the scan's rule-based conflicts are fixed by the recording (OUTCOME).
const asset = (set, f) => JSON.parse(readFileSync(new URL(`../server/assets/${set}/${f}`, import.meta.url), 'utf8'))
const OUTCOME = { oz: { pending: 859, unverified: 3, conflicts: 0 }, alice: { pending: 245, unverified: 1, conflicts: 0 } }
for (const [set, name] of [['oz', 'The Oz books (sample)'], ['alice', 'Alice (sample)']]) {
  const manifest = asset(set, 'manifest.json')
  const pages = asset(set, 'entities.json')
  const drafts = Object.entries(asset(set, 'candidates.json')).filter(([k]) => k !== '_note').reduce((n, [, l]) => n + l.length, 0)
  check(`create ${set} project`, (await a('/api/projects', { method: 'POST', body: { name, studio_id: studio.id } })).status, 200)
  const t = Date.now()
  check(`load ${set}`, (await load(a, { set })).status, 200)
  console.log(`--  ${set} load took ${Date.now() - t} ms`)
  const s = (await a('/api/stats')).data
  check(`${set}: documents as in the manifest, no canon`, [s.documents, s.canon], [Object.keys(manifest.docs).length, 0])
  check(`${set}: medium prose`, (await a('/api/me')).data.current.project.medium, 'prose')
  const docs = (await a('/api/documents')).data
  const lib = (await a('/api/library')).data
  check(`${set}: one folder per book, every chapter a scene`, [sorted(lib.folders.map(f => f.name)), docs.every(d => d.kind === 'scene')], [sorted(new Set(Object.values(manifest.docs).map(d => d.folder))), true])
  check(`${set}: wiki pages preloaded`, sorted((await a('/api/entities')).data.filter(e => e.origin === 'manual').map(e => e.name)), sorted(pages.map(p => p.name)))
  const cover = (await a('/api/export/bible?book=manuscript')).data.cover
  check(`${set}: the cover is served`, !!cover && (await a(cover)).status, 200)
  const calls = (await a('/api/model-calls')).data
  check(`${set}: the load replays the recording (no live model call)`, [...new Set(calls.filter(c => c.purpose === 'extract').map(c => c.model_id))], ['mock:recorded-fixtures'])
  const pending = (await a('/api/facts?status=pending')).data
  const unverified = pending.filter(f => !f.evidence.some(e => e.verified))
  console.log(`--  ${set}: ${drafts} recorded candidates, ${pending.length} pending, ${unverified.length} with a quote not found verbatim`)
  check(`${set}: recorded candidates wait for review`, [pending.length, unverified.length], [OUTCOME[set].pending, OUTCOME[set].unverified])
  for (let i = 0; i < pending.length; i += 500)
    await a('/api/facts/accept-verified', { method: 'POST', body: { items: pending.slice(i, i + 500).map(f => ({ id: f.id, fingerprint: candidateFingerprint(f) })) } })
  check(`${set}: canon = pending − unverified`, (await a('/api/stats')).data.canon, pending.length - unverified.length)
  const scan = await a('/api/conflicts/scan', { method: 'POST' })
  check(`${set}: scan`, [scan.status, scan.data.model_error ?? null], [200, null])
  const conflicts = (await a('/api/conflicts')).data
  for (const c of conflicts) console.log(`--  ${c.rule} (${c.severity}): ${c.left.statement} / ${c.right.statement}`)
  if (recorded) check(`${set}: conflicts the scan raises`, conflicts.length, OUTCOME[set].conflicts)
}
console.log('samples probe passed')
