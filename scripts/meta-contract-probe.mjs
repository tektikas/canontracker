// Runs CanonTracker's real Meta Model API code paths (extraction, Ask, image generation) against responses Meta really
// returned, replayed by scripts/meta-fake.mjs. Start both first:
//   node scripts/meta-fake.mjs 4281
//   HOST=localhost PORT=4280 NUXT_SESSION_PASSWORD=<32+ chars> NUXT_MODEL_MODE=meta NUXT_META_API_KEY=fixture \
//     NUXT_META_BASE_URL=http://localhost:4281/v1 node .output/server/index.mjs
//   node scripts/meta-contract-probe.mjs http://localhost:4280 http://localhost:4281
// Checks: the app parses each real envelope (success, 400, 404, image b64), every top-level key it sends was in a request
// Meta accepted (2xx) on that endpoint, the Bearer key is sent, and failures are shown, never replaced with recorded output.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const app = process.argv[2] ?? 'http://localhost:4280'
const fake = process.argv[3] ?? 'http://localhost:4281'
const dir = new URL('../server/assets/meta-fixtures/', import.meta.url)
const fixtures = Object.fromEntries(readdirSync(dir).map(f => [f.slice(0, -5), JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]))
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label}`) }

// Keys Meta accepted per endpoint, from the recorded 2xx requests.
const accepted = {}
for (const f of Object.values(fixtures)) {
  if (f.status < 200 || f.status >= 300 || !f.request.body) continue
  const set = accepted[f.request.path] ??= new Set()
  Object.keys(f.request.body).forEach(k => set.add(k))
}

let cookie = ''
async function api(path, body) {
  const res = await fetch(app + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0])
  if (set.length) cookie = set.join('; ')
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}
const queue = names => fetch(`${fake}/_queue`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fixtures: names }) }).then(r => r.json())
// What the app sent since the last call; every request must have used a queued fixture of the right endpoint.
async function sent(label, n, path) {
  const { requests, queued } = await fetch(`${fake}/_requests`).then(r => r.json())
  check(`${label}: ${n} request(s) to ${path}, queue drained`, { n: requests.length, paths: [...new Set(requests.map(r => r.path))], queued }, { n, paths: [`/v1${path}`], queued: [] })
  for (const r of requests) {
    assert.ok(r.bearer, `${label}: Bearer key sent`)
    const unknown = Object.keys(r.body).filter(k => !accepted[path]?.has(k))
    check(`${label}: request keys ${Object.keys(r.body).join(', ')} were all accepted by Meta on ${path}`, unknown, [])
  }
  return requests
}

await fetch(`${fake}/_requests`) // start clean
const run = Date.now().toString(36)
assert.equal((await api('/api/auth/signup', { name: 'Contract', email: `contract-${run}@meta-probe.test`, password: 'correct horse' })).status, 200)
const studio = (await api('/api/studios', { name: 'Contract Studio' })).data
assert.equal((await api('/api/projects', { name: 'Contract', studio_id: studio.id })).status, 200)

// 1. Extraction: the Lantern Row sample imports 3 documents, one chat call each. The real envelope parses; its content is a
// verdict object, not {"candidates":[…]}, so no candidates come out (and none are invented). The preloaded canon stays.
await queue(['chat-json-schema', 'chat-json-schema', 'chat-json-schema'])
const load = await api('/api/demo/load', { set: 'lantern-row' })
check('demo load in meta mode', { status: load.status, facts: load.data.facts, candidates: load.data.results.map(r => r.candidates ?? 0) }, { status: 200, facts: 5, candidates: [0, 0, 0] })
const extract = await sent('extract', 3, '/chat/completions')
check('extract request: system + user messages, temperature 0', extract.map(r => [r.body.messages.map(m => m.role), r.body.temperature]), Array(3).fill([['system', 'user'], 0]))

// 2. Ask: a real 200 envelope with JSON content that is not an answer → "unknown", no error.
const question = 'Where is Ines at 20:30 on Day 1?'
await queue(['chat-json-schema'])
let ask = await api('/api/qa', { question })
check('ask with a real 200 envelope', { status: ask.status, answer: ask.data.status, error: ask.data.model_error }, { status: 200, answer: 'unknown', error: null })
await sent('ask', 1, '/chat/completions')

// 3. Ask against Meta's real 404 and 400 bodies: the code and message reach the user; no recorded fallback.
await queue(['error-bad-model'])
ask = await api('/api/qa', { question })
check('ask with real 404 model_not_found', [ask.data.status, ask.data.answer, ask.data.model_error],
  ['source_only', null, 'Model call failed: AI provider error 404 — model_not_found: The requested model was not found. Nothing was replaced with recorded output.'])
await sent('ask 404', 1, '/chat/completions')
await queue(['error-bad-param'])
ask = await api('/api/qa', { question })
assert.match(ask.data.model_error, /^Model call failed: AI provider error 400 — only `"auto"` is supported for `tool_choice`/)
console.log('ok  ask with real 400 (code null): message shown')
await sent('ask 400', 1, '/chat/completions')

// 4. Image generation with the real b64_json envelope (webp; the image is the real one, downscaled for the repo).
const entity = (await api('/api/entities')).data.find(e => e.name === 'Ines')
await queue(['images-b64'])
const img = await api('/api/images', { target_type: 'entity', target_id: entity.id, prompt: 'Ines at the furnace', n: 1 })
check('image from real b64_json', { status: img.status, n: img.data.length, mime: img.data[0]?.mime, model: img.data[0]?.model_id }, { status: 200, n: 1, mime: 'image/webp', model: 'muse-image-1.0' })
const imgReq = await sent('image', 1, '/images/generations')
check('image request: model, prompt, n', [imgReq[0].body.model, imgReq[0].body.n, typeof imgReq[0].body.prompt], ['muse-image-1.0', 1, 'string'])

// 5. Every call above is in model_calls: ok rows for the parsed envelopes, failed rows for the 404 and 400.
const rows = (await api('/api/model-calls')).data.map(c => `${c.purpose}:${c.status}`)
for (const want of ['extract:ok', 'answer:ok', 'answer:failed', 'image:ok']) assert.ok(rows.includes(want), `model_calls has ${want} (${rows.join(', ')})`)
check('model_calls: 2 failed answers recorded', rows.filter(r => r === 'answer:failed').length, 2)

// 6. The fake refuses a fixture for the wrong endpoint, so a probe can't pass on the wrong code path.
await queue(['images-b64'])
await api('/api/qa', { question })
const wrong = await fetch(`${fake}/_requests`).then(r => r.json())
check('fake refuses a fixture queued for another endpoint', wrong.requests.length, 1)

// 7. A continuity check of a private draft that fails on Meta's real 400: the error reaches the writer, and the failed run's
// trace (it holds the draft text) is the author's alone on both trace endpoints.
const draft = `Ines waits alone by the furnace at 20:30 on Day 1 (${run}).`
await queue(['error-responses-bad-combo'])
const cty = await api('/api/continuity', { text: draft })
check('continuity on a real 400: Meta\'s message shown', [cty.status, /^Continuity check failed: AI provider error 400/.test(cty.data.message)], [503, true])
await sent('continuity 400', 1, '/responses')
const mine = (await api('/api/agents/runs?purpose=continuity')).data
check('author: the failed run is in agent activity', mine.map(r => [r.status, r.steps.some(s => s.input?.includes(draft))]), [['failed', true]])
check('author: and in the model-call trace', (await api('/api/model-calls')).data.some(c => c.purpose === 'continuity' && c.input?.includes(draft)), true)
check('author: no report for a failed run', (await api(`/api/continuity/${mine[0].id}`)).status, 404)
const link = (await api('/api/team/invites', { role: 'editor', days: 1 })).data
const owner = cookie
cookie = ''
assert.equal((await api('/api/auth/signup', { name: 'Other', email: `contract-other-${run}@meta-probe.test`, password: 'correct horse' })).status, 200)
check('another editor joins', (await api(`/api/invites/${link.token}/accept`, {})).status, 200)
check('other editor: agent activity has no continuity run', (await api('/api/agents/runs?purpose=continuity')).data, [])
check('other editor: nor by its id', (await api(`/api/agents/runs?run=${mine[0].id}`)).data, [])
const theirs = (await api('/api/model-calls')).data
check('other editor: the model-call trace has neither the run nor the draft text', [theirs.some(c => c.purpose === 'continuity'), JSON.stringify(theirs).includes(draft)], [false, false])
cookie = owner
console.log('\nall meta contract checks passed')
