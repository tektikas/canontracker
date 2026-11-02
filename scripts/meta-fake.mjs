// QA ONLY. A local Meta Model API that replays real recorded responses (server/assets/meta-fixtures/*.json, recorded
// 2026-11-02 against api.meta.ai with ids, encrypted reasoning and signed URLs redacted). Nothing here is invented: each
// answer is the status and body Meta actually returned for the request stored next to it in the fixture.
//   node scripts/meta-fake.mjs 4281
//   NUXT_MODEL_MODE=meta NUXT_META_API_KEY=fixture NUXT_META_BASE_URL=http://localhost:4281/v1 node .output/server/index.mjs
// The test decides what comes next: POST /_queue {"fixtures":["chat-json-schema", …]} appends to a queue, and each API
// request takes the next one. The fixture must be for the same endpoint (POST /chat/completions, GET /responses/{id}, …) or
// the fake answers 500, so a probe can't pass on the wrong code path. An empty queue is a 500 too. GET /_requests returns
// (and clears) what the app sent: method, path, whether it sent a Bearer key (never the key) and the JSON body.
import { createServer } from 'node:http'
import { readFileSync, readdirSync } from 'node:fs'

const port = Number(process.argv[2] ?? 4281)
const dir = new URL('../server/assets/meta-fixtures/', import.meta.url)
const fixtures = Object.fromEntries(readdirSync(dir).filter(f => f.endsWith('.json'))
  .map(f => [f.slice(0, -5), JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]))
const queue = []
let received = []

// "/v1/responses/resp_x/cancel" and "/responses/resp_y/cancel" are the same endpoint.
const endpoint = (method, path) => `${method} ${path.replace(/^\/v1/, '').replace(/\/(resp_|file-)[^/]+/, '/{id}')}`
const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
const fail = (res, message) => send(res, 500, { error: { message: `meta-fake: ${message}`, type: 'server_error', code: 'fake_misuse', param: null } })

createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  let body = null
  try { body = raw ? JSON.parse(raw) : null } catch { body = raw }
  const path = new URL(req.url, 'http://x').pathname

  if (path === '/_queue' && req.method === 'POST') {
    const names = body?.fixtures ?? []
    const unknown = names.filter(n => !fixtures[n])
    if (unknown.length) return fail(res, `unknown fixtures ${unknown.join(', ')}`)
    queue.push(...names)
    return send(res, 200, { queued: queue.length })
  }
  if (path === '/_requests') {
    const out = received
    received = []
    return send(res, 200, { requests: out, queued: queue })
  }
  if (path === '/_fixtures') return send(res, 200, Object.keys(fixtures))

  received.push({ method: req.method, path, bearer: /^Bearer \S+$/.test(req.headers.authorization ?? ''), body })
  const name = queue.shift()
  if (!name) return fail(res, `no fixture queued for ${endpoint(req.method, path)}`)
  const f = fixtures[name]
  const want = endpoint(f.request.method, f.request.path), got = endpoint(req.method, path)
  if (want !== got) return fail(res, `fixture ${name} is for ${want}, got ${got}`)
  send(res, f.status, f.body)
}).listen(port, 'localhost', () => console.log(`meta-fake on http://localhost:${port} with ${Object.keys(fixtures).length} fixtures`))
