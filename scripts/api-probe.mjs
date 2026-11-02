// API probe against a running server: node scripts/api-probe.mjs <baseUrl>
// Walks every route file under server/api and sends it bad input: no body, JSON null / array / string / number, and an object
// whose usual fields have the wrong type. No route may answer 5xx. Then: every content write as a viewer is 403 (except Ask
// and leaving), every content route signed out is 401, project ids from another studio are 404, oversized JSON is 413 (also
// chunked), log-in and sign-up are throttled, and
// downloads work for a project whose name is not Latin-1. Creates throwaway accounts (unique emails per run).
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { candidateFingerprint } from '../shared/utils/review.ts'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
const ok = (label, extra = '') => console.log(`ok  ${label}${extra ? ` (${extra})` : ''}`)

function web() {
  let cookie = ''
  return async (path, { method = 'GET', body, raw, headers = {} } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie, ...headers }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const text = await res.text()
    let data; try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data, headers: res.headers }
  }
}
async function account(name) {
  const c = web()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })).status, 200)
  return c
}

// Ada: the Ashbell Pass demo, accepted, scanned, a change and a note, so ids exist for every kind of route.
const ada = await account('Ada')
const studio = (await ada('/api/studios', { method: 'POST', body: { name: 'Probe Studio' } })).data
const project = (await ada('/api/projects', { method: 'POST', body: { name: 'Probe Pass', studio_id: studio.id } })).data
assert.equal((await ada('/api/demo/load', { method: 'POST', body: { set: 'ashbell-pass' } })).status, 200)
const pending = (await ada('/api/facts?status=pending')).data
assert.equal((await ada('/api/facts/accept-verified', { method: 'POST', body: { items: pending.map(f => ({ id: f.id, fingerprint: candidateFingerprint(f) })) } })).status, 200)
await ada('/api/conflicts/scan', { method: 'POST' })
const canon = (await ada('/api/facts?status=canon')).data
const doc = (await ada('/api/documents')).data[0]
const full = (await ada(`/api/documents/${doc.id}`)).data
const change = (await ada('/api/changes', { method: 'POST', body: { target_fact_id: canon[0].id, proposed_statement: 'Probe change.', rationale: 'probe' } })).data
const note = (await ada('/api/notes', { method: 'POST', body: { document_id: doc.id, passage_id: full.passages[0].id, body: 'probe note' } })).data
const draft = (await ada('/api/drafts', { method: 'POST', body: { title: 'Probe draft' } })).data
const folder = (await ada('/api/library/folders', { method: 'POST', body: { name: 'Probe folder' } })).data
const tag = (await ada('/api/library/tags', { method: 'POST', body: { name: 'probe', color: 'accent' } })).data
const share = (await ada('/api/shares', { method: 'POST', body: { name: 'probe link' } })).data
const token = (await ada('/api/agent-tokens', { method: 'POST', body: { name: 'probe' } })).data
const entity = (await ada('/api/entities')).data[0]
const conflict = (await ada('/api/conflicts')).data[0]
const bo = await account('Bo')
const invite = (await ada('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 7 } })).data
assert.equal((await bo(`/api/invites/${invite.token}/accept`, { method: 'POST' })).status, 200)
await bo(`/api/projects/${project.id}/switch`, { method: 'POST' })
const boId = (await bo('/api/me')).data.user.id
const invite2 = (await ada('/api/team/invites', { method: 'POST', body: { role: 'editor', days: 7 } })).data
for (const [k, x] of Object.entries({ change, note, draft, folder, tag, share, token, entity, conflict, invite2 })) assert.ok(x?.id, `setup ${k}: ${JSON.stringify(x)?.slice(0, 160)}`)
ok('setup', `${canon.length} canon facts, ids for every route`)

// Every route file -> [method, path with real ids].
const root = fileURLToPath(new URL('../server/api', import.meta.url))
const files = (function walk(d) { return readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) })(root)
const ID = { id: null, userId: boId, token: invite2.token, key: 'npc' }
const idFor = (dir) => ({ changes: change.id, conflicts: conflict.id, documents: doc.id, drafts: draft.id, entities: entity.id, facts: canon[1].id, images: 'img_nope',
  notes: note.id, projects: project.id, shares: share.id, tasks: 'task_nope', folders: folder.id, tags: tag.id, invites: invite2.id, 'agent-tokens': token.id, portrait: entity.id })[dir] ?? 'x_nope'
const routes = files.map((f) => {
  const rel = relative(root, f).replace(/\\/g, '/').replace(/\.ts$/, '')
  const method = rel.match(/\.(get|post|put|patch|delete)$/)[1].toUpperCase()
  const parts = rel.replace(/\.(get|post|put|patch|delete)$/, '').split('/').filter(p => p !== 'index')
  const path = parts.map((p, i) => { const m = p.match(/^\[(\w+)\]$/); return m ? encodeURIComponent(ID[m[1]] ?? idFor(parts[i - 1])) : p }).join('/')
  return { method, path: `/api/${path}`, file: rel }
})
assert.ok(routes.length > 90, `${routes.length} routes`)

// Size: oversized JSON bodies are refused before they are read.
assert.equal((await ada('/api/qa', { method: 'POST', raw: JSON.stringify({ question: 'x'.repeat(5_000_000) }) })).status, 413)
assert.equal((await ada('/api/qa', { method: 'POST', body: { question: 'x'.repeat(600) } })).status, 400)
assert.equal((await ada('/api/changes', { method: 'POST', body: { target_fact_id: canon[2].id, proposed_statement: 'x'.repeat(600), rationale: 'r' } })).status, 400)
assert.equal((await web()('/api/auth/signup', { method: 'POST', body: { name: 'Long', email: `${'x'.repeat(300)}@probe.test`, password: 'correct horse' } })).status, 400)
// Chunked (no Content-Length): the cap holds while the body streams in.
const chunked = (path, text, headers = {}) => fetch(base + path, { method: 'POST', duplex: 'half', headers: { 'content-type': 'application/json', ...headers },
  body: new ReadableStream({ start(ctl) { const b = Buffer.from(text); for (let i = 0; i < b.length; i += 65536) ctl.enqueue(b.subarray(i, i + 65536)); ctl.close() } }) })
  .then(r => r.status, e => `error ${e.cause?.code ?? e.message}`)
assert.equal(await chunked('/api/auth/login', JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(4_100_000) })), 413)
assert.equal(await chunked('/api/auth/login', JSON.stringify({ email: `nobody-${run}@probe.test`, password: 'x'.repeat(1000) })), 401)
// The multipart media type is case-insensitive: a 4.1 MB five-file upload is the same request whatever its Content-Type's case.
{
  const bnd = 'ci-probe'
  const part = i => Buffer.concat([Buffer.from(`--${bnd}\r\nContent-Disposition: form-data; name="files"; filename="ci-${run}-${i}.md"\r\nContent-Type: text/markdown\r\n\r\n# Case ${i}\n\n${String.fromCharCode(97 + i).repeat(820_000)}\r\n`)])
  const raw = Buffer.concat([...[0, 1, 2, 3, 4].map(part), Buffer.from(`--${bnd}--\r\n`)])
  for (const ct of ['multipart/form-data', 'Multipart/Form-Data', ' MULTIPART/form-data']) {
    const res = await ada('/api/documents', { method: 'POST', raw, headers: { 'content-type': `${ct}; boundary=${bnd}` } })
    assert.equal(res.status, 200, `${ct}: ${res.status}`)
  }
}
ok('size caps: 413 over 4 MB (also chunked); long question / statement / email 400')

// Log-in and sign-up throttles. Fake client IPs (X-Forwarded-For, as the proxy sets it) keep this probe's misses away from the
// IP every other probe signs up from.
const ipBase = `10.${parseInt(run.slice(-4), 36) % 250}.${Math.floor(Math.random() * 250)}`
const login = (email, password, ip) => web()('/api/auth/login', { method: 'POST', body: { email, password }, headers: { 'x-forwarded-for': `203.0.113.9, ${ip}` } })
await account('Deb')
const debEmail = `deb-${run}@probe.test`
for (let i = 0; i < 9; i++) assert.equal((await login(debEmail, 'wrong horse', `${ipBase}.${i + 1}`)).status, 401)
for (let i = 0; i < 3; i++) assert.equal((await login(debEmail, 'correct horse', `${ipBase}.20`)).status, 200)
assert.equal((await login(debEmail, 'wrong horse', `${ipBase}.21`)).status, 401) // 10th failure: successes did not count
const locked = await login(debEmail, 'correct horse', `${ipBase}.22`)
assert.deepEqual([locked.status, /Try again in \d+ min/.test(locked.data.message)], [429, true])
ok('log-in: 10 failures per email in 5 min, then 429 even with the right password; successes don\'t count')
for (let i = 0; i < 30; i++) assert.equal((await login(`ghost${i}-${run}@probe.test`, 'wrong horse', `${ipBase}.30`)).status, 401)
assert.equal((await login(`ghost-x-${run}@probe.test`, 'wrong horse', `${ipBase}.30`)).status, 429)
assert.equal((await login(`ada-${run}@probe.test`, 'correct horse', `${ipBase}.30`)).status, 429)
assert.equal((await login(`ada-${run}@probe.test`, 'correct horse', `${ipBase}.31`)).status, 200)
ok('log-in: 30 failures per IP in 5 min, then 429 for that IP only')
const signup = ip => web()('/api/auth/signup', { method: 'POST', body: { name: 'S', email: 'not-an-email', password: 'x' }, headers: { 'x-forwarded-for': ip } })
for (let i = 0; i < 100; i++) assert.equal((await signup(`${ipBase}.40`)).status, 400)
assert.equal((await signup(`${ipBase}.40`)).status, 429)
assert.equal((await signup(`${ipBase}.41`)).status, 400)
ok('sign-up: 100 per IP in 10 min, then 429')

// Viewer: every content write is 403, except Ask, voice input (speech to text for Ask; nothing stored) and leaving the studio.
const ACCOUNT = ['/api/auth/', '/api/invites', '/api/studios', '/api/account', '/api/projects', '/api/agent-tokens', '/api/public/']
const viewerWrites = routes.filter(r => r.method !== 'GET' && !ACCOUNT.some(p => r.path.startsWith(p)) && r.path !== '/api/qa' && r.path !== '/api/voice/transcribe' && !(r.method === 'DELETE' && r.path === `/api/team/${boId}`))
const leaks = []
for (const r of viewerWrites) {
  const res = await bo(r.path, { method: r.method, body: {} })
  if (res.status !== 403) leaks.push(`${r.method} ${r.path} -> ${res.status}`)
}
assert.deepEqual(leaks, [])
assert.equal((await bo('/api/qa', { method: 'POST', body: { question: 'Who rings the Ashbell?' } })).status, 200)
assert.equal((await bo('/api/voice/transcribe', { method: 'POST', body: {} })).status, 400) // not a clip: refused, never a 5xx
ok('viewer writes are 403', `${viewerWrites.length} write routes; Ask and voice input allowed`)

// Signed out: every content route is 401.
const anon = web()
const content = routes.filter(r => !ACCOUNT.some(p => r.path.startsWith(p)) && !['/api/me', '/api/health'].includes(r.path))
const open = []
for (const r of content) {
  const res = await anon(r.path, { method: r.method, body: r.method === 'GET' ? undefined : {} })
  if (res.status !== 401) open.push(`${r.method} ${r.path} -> ${res.status}`)
}
assert.deepEqual(open, [])
ok('signed out: content routes 401', `${content.length} routes`)

// Another studio: Cy's own project is open; Ada's ids are 404 for her, reads and writes alike.
const cy = await account('Cy')
const cyStudio = (await cy('/api/studios', { method: 'POST', body: { name: 'Elsewhere' } })).data
await cy('/api/projects', { method: 'POST', body: { name: 'Other', studio_id: cyStudio.id } })
const foreign = [['GET', `/api/documents/${doc.id}`], ['GET', `/api/entities/${entity.id}`], ['GET', `/api/projects/${project.id}`], ['GET', `/api/changes/${change.id}/export`],
  ['PATCH', `/api/notes/${note.id}`, { body: 'x' }], ['POST', `/api/facts/${canon[1].id}/review`, { decision: 'reject', rationale: 'x' }], ['POST', `/api/conflicts/${conflict.id}/decision`, { decision: 'confirmed', rationale: 'x' }],
  ['PATCH', `/api/library/folders/${folder.id}`, { name: 'x' }], ['DELETE', `/api/shares/${share.id}`], ['DELETE', `/api/agent-tokens/${token.id}`], ['GET', `/api/drafts/${draft.id}`],
  ['POST', '/api/notes', { document_id: doc.id, passage_id: full.passages[0].id, body: 'x' }], ['POST', '/api/changes', { target_fact_id: canon[1].id, proposed_statement: 'x', rationale: 'x' }],
  ['POST', '/api/library/organise', { document_ids: [doc.id], folder_id: null }]]
const crossed = []
for (const [method, path, body] of foreign) {
  const res = await cy(path, { method, body })
  if (res.status !== 404) crossed.push(`${method} ${path} -> ${res.status}`)
}
assert.deepEqual(crossed, [])
ok("another studio's ids are 404", `${foreign.length} reads and writes`)

// Routes whose side effects would end the walk: they get the bad bodies on a throwaway id or not at all.
const SKIP = new Set(['POST /api/demo/load', `DELETE /api/team/${boId}`, `POST /api/projects/${project.id}/switch`, `POST /api/invites/${invite2.token}/accept`])
const WRONG = { name: {}, title: {}, body: {}, quote: {}, rationale: {}, decision: 'accept', question: {}, proposed_statement: {}, target_fact_id: {},
  aliases: 5, summary: 7, notes: [], fields: 'x', kind: {}, studio_id: {}, folder_id: {}, parent_id: {}, add_tags: 'x', remove_tags: 5, document_ids: 'x',
  style: ['ink'], corrected: null, into: {}, role: {}, color: {}, icon: {}, status: {}, comment: {}, assignee_id: {}, due_date: {}, items: 'x', fact_ids: 'x',
  action: {}, email: {}, password: {}, current_password: {}, new_password: {}, medium: {}, severity: {}, days: {}, scope: {}, prompt: {}, caption: {}, content: {}, document_id: {}, passage_id: {} }
const BODIES = [['none', undefined], ['null', 'null'], ['array', '[]'], ['string', '"x"'], ['number', '42'], ['wrong types', JSON.stringify(WRONG)]]
const fails = []
for (const r of routes) {
  if (SKIP.has(`${r.method} ${r.path}`)) continue
  for (const [label, raw] of r.method === 'GET' || r.method === 'DELETE' ? [['none', undefined]] : BODIES) {
    const res = await ada(r.path, { method: r.method, raw })
    if (res.status >= 500) fails.push(`${r.method} ${r.path} [${label}] -> ${res.status} ${JSON.stringify(res.data).slice(0, 160)}`)
  }
}
// Query strings with odd values.
for (const q of ['/api/facts?status=x', '/api/changes/' + change.id + '/export?format=a%0D%0Ab', '/api/changes/' + change.id + '/export?format=%C3%A7', '/api/audit/export?format=x',
  '/api/export/bible?format=x', '/api/search?q=%25_%5C', '/api/documents/' + doc.id + '/diff?from=x', '/api/images?target_type=x'])
  if ((await ada(q)).status >= 500) fails.push(`GET ${q} -> 5xx`)
assert.deepEqual(fails, [], `\n${fails.join('\n')}`)
ok('no route answers 5xx to bad bodies or queries', `${routes.length} routes`)

// Downloads for a project named outside Latin-1 (Content-Disposition must stay ASCII with a UTF-8 filename*).
assert.equal((await ada(`/api/projects/${project.id}`, { method: 'PATCH', body: { name: 'Kırık Gelgit 東' } })).status, 200)
for (const p of ['/api/export/bible?format=md', '/api/export/bible?format=zip', '/api/audit/export?format=csv', `/api/changes/${change.id}/export?format=md`]) {
  const res = await ada(p)
  assert.equal(res.status, 200, `${p}: ${res.status} ${JSON.stringify(res.data).slice(0, 120)}`)
}
ok('downloads work for a non-Latin-1 project name')
console.log('\napi probe passed')
