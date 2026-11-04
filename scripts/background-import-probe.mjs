// Background import probe against a running server in recorded mode: node scripts/background-import-probe.mjs [baseUrl]
// An upload with background=1 answers with the stored version and extraction "queued" (no candidate counts); the run then
// reaches done with the same candidates a synchronous upload of the same file makes, pending in Review and audited as the
// uploader. Two studios uploading at once each get their own candidates and audit actor (the background run keeps the
// request's access context), and at most 3 runs overlap. A file the recorded mode has no output for ends failed with that
// message; Try again (re-extract in the background) queues it again. A viewer can't start either; another studio sees nothing.
// Without background=1 the upload and re-extract answer exactly as before.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
const doc = name => readFileSync(new URL(`../server/assets/broken-tide/docs/${name}`, import.meta.url), 'utf8')

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
async function account(name, project = true) {
  const c = client()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })).status, 200)
  if (project) {
    const studio = (await c('/api/studios', { method: 'POST', body: { name: `${name} Studio` } })).data
    await c('/api/projects', { method: 'POST', body: { name: `${name} project`, studio_id: studio.id } })
  }
  return c
}
const form = (files, background) => {
  const f = new FormData()
  for (const [name, text] of files) f.append('files', new Blob([text], { type: 'text/markdown' }), name)
  if (background) f.append('background', '1')
  return f
}
const upload = async (c, files, background = true) => (await c('/api/documents', { method: 'POST', form: form(files, background) })).data.results
async function settle(c, ids) {
  for (let i = 0; i < 200; i++) {
    const rows = (await c('/api/extractions')).data.filter(r => ids.includes(r.document_id))
    if (rows.length === ids.length && rows.every(r => r.status === 'done' || r.status === 'failed')) return rows
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('background extraction did not finish in 20 s')
}
const pendingOf = async (c, docId) => (await c('/api/facts?status=pending')).data.filter(f => f.evidence.some(e => e.document_id === docId))

// 1. The synchronous upload (no background field) answers as before: candidate counts, no extraction status.
const ref = await account('Sync')
const S = ['S01.md', 'S02.md', 'S03.md', 'S04.md']
const syncResults = await upload(ref, S.map(n => [n, doc(n)]), false)
check('a synchronous upload still answers with candidate counts', syncResults.map(r => [r.status, typeof r.candidates, 'extraction' in r]), S.map(() => ['imported', 'number', false]))
const expected = syncResults.map(r => r.candidates)
assert.ok(expected.every(n => n > 0), 'the recorded sample files have candidates')

// 2. background=1: answered at once with the stored version and extraction queued.
const ada = await account('Ada')
const t0 = Date.now()
const [one] = await upload(ada, [['S01.md', doc('S01.md')]])
console.log(`    answered in ${Date.now() - t0} ms`)
check('a background upload stores the version', [one.status, one.version, one.passages > 0], ['imported', 1, true])
check('it answers before extraction: status queued, no counts yet', [one.extraction?.status, 'candidates' in one], ['queued', false])
const [done1] = await settle(ada, [one.document_id])
check('the run reaches done with the synchronous candidate count', [done1.status, done1.created], ['done', expected[0]])
check('it records when it started and ended', [!!done1.started_at, !!done1.ended_at, done1.error], [true, true, null])
check('the candidates are pending in Review', (await pendingOf(ada, one.document_id)).length, expected[0])
const adaAudit = (await ada('/api/audit')).data
check('candidates are audited as the uploader', [...new Set(adaAudit.filter(e => e.event_type === 'candidate.created').map(e => e.actor_name))], ['Ada'])
check('the import itself is audited once', adaAudit.filter(e => e.event_type === 'document.imported').length, 1)

// 3. Two studios at once: each run keeps its own request's project and person; at most 3 overlap.
const bea = await account('Bea')
const [adaUp, beaUp] = await Promise.all([upload(ada, S.slice(1).map(n => [n, doc(n)])), upload(bea, S.map(n => [n, doc(n)]))])
check('every upload is answered queued', [...adaUp, ...beaUp].map(r => r.extraction?.status), Array(7).fill('queued'))
const adaRows = await settle(ada, adaUp.map(r => r.document_id))
const beaRows = await settle(bea, beaUp.map(r => r.document_id))
check('all of them finish', [...adaRows, ...beaRows].every(r => r.status === 'done'), true)
check('the totals match synchronous uploads', [adaRows.reduce((n, r) => n + r.created, 0) + done1.created, beaRows.reduce((n, r) => n + r.created, 0)], [expected.reduce((a, b) => a + b), expected.reduce((a, b) => a + b)])
const beaPending = (await bea('/api/facts?status=pending')).data
const beaDocs = new Set(beaUp.map(r => r.document_id))
check('Bea\'s candidates cite only Bea\'s documents', beaPending.every(f => f.evidence.every(e => beaDocs.has(e.document_id))), true)
check('Bea\'s candidates are audited as Bea', [...new Set((await bea('/api/audit')).data.filter(e => e.event_type === 'candidate.created').map(e => e.actor_name))], ['Bea'])
check('each project lists only its own runs', [(await ada('/api/extractions')).data.length, (await bea('/api/extractions')).data.length], [4, 4])
const spans = [...adaRows, ...beaRows].map(r => [Date.parse(r.started_at), Date.parse(r.ended_at)])
const overlap = Math.max(...spans.map(([s, e]) => spans.filter(([s2, e2]) => s2 <= s && s < e2).length))
check('at most 3 runs read at once', overlap <= 3, true)

// 4. Failure: recorded mode has no output for this text, so the run fails with that message; Try again queues it again.
const [mine] = await upload(ada, [['my-notes.md', `# My notes ${run}\n\nThe ferry leaves at dawn.`]])
const [failed] = await settle(ada, [mine.document_id])
check('a file with no recorded output ends failed', failed.status, 'failed')
check('with a plain message', /no AI model is connected/.test(failed.error), true)
check('the failure is audited', (await ada('/api/audit')).data.some(e => e.event_type === 'job.failed' && e.target_id === mine.document_id && e.detail.background), true)
const retry = await ada(`/api/documents/${mine.document_id}/extract`, { method: 'POST', body: { background: true } })
check('Try again answers at once, queued', [retry.status, retry.data.extraction?.status, retry.data.document_id], [200, 'queued', mine.document_id])
const [again] = await settle(ada, [mine.document_id])
check('the retried run ends failed again, with the message', [again.status, /no AI model/.test(again.error)], ['failed', true])
const sync = await ada(`/api/documents/${mine.document_id}/extract`, { method: 'POST' })
check('re-extract without background answers as before', [sync.status, sync.data.mode, sync.data.recorded_covers, 'extraction' in sync.data], [200, 'mock', false, false])

// 5. Viewers read statuses but start nothing; another studio sees none of them.
const link = (await ada('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 1 } })).data
const vic = await account('Vic', false)
await vic(`/api/invites/${link.token}/accept`, { method: 'POST' })
await vic(`/api/projects/${(await ada('/api/me')).data.current.project.id}/switch`, { method: 'POST' })
check('a viewer reads the statuses', (await vic('/api/extractions')).data.length, 5)
check('a viewer can\'t upload in the background', (await vic('/api/documents', { method: 'POST', form: form([['v.md', '# V\n\nViewer text here.']], true) })).status, 403)
check('a viewer can\'t start Try again', (await vic(`/api/documents/${mine.document_id}/extract`, { method: 'POST', body: { background: true } })).status, 403)
check('another studio can\'t retry a foreign document', (await bea(`/api/documents/${mine.document_id}/extract`, { method: 'POST', body: { background: true } })).status, 404)
check('signed out: statuses 401', (await client()('/api/extractions')).status, 401)
console.log('background import probe passed')
