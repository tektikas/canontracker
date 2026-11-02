// Re-check read cost on a big source: node scripts/recheck-timing.mjs <baseUrl> [passages=2105] [citations=20]
// One document of N paragraphs, C canon facts citing it, then a v2 that changes one uncited line, so all C citations are
// stale and unchanged (re-classified on every read). Prints the v2 upload time (its import classifies them first, cold) and
// the first read after that upload (the upload already warmed the memo, so it is not a cold read) and warm (median of 5) times of GET /api/facts?status=canon and GET /api/stats. Read-only after the upload.
import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://localhost:3000'
const N = Number(process.argv[3] ?? 2105)
const C = Number(process.argv[4] ?? 20)
const run = Date.now().toString(36)
let cookie = ''
async function api(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(base + path, { method, headers: form ? { cookie } : { 'content-type': 'application/json', cookie }, body: form ?? (body && JSON.stringify(body)) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const text = await res.text()
  assert.ok(res.ok, `${method} ${path}: ${res.status} ${text.slice(0, 200)}`)
  return JSON.parse(text)
}
const upload = (name, text) => {
  const f = new FormData()
  f.append('files', new Blob([text], { type: 'text/markdown' }), name)
  return api('/api/documents', { method: 'POST', form: f })
}
const timed = async (fn) => {
  const t = performance.now()
  const out = await fn()
  return [performance.now() - t, out]
}
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]

await api('/api/auth/signup', { method: 'POST', body: { name: 'Tim', email: `timing-${run}@probe.test`, password: 'correct horse' } })
const studio = await api('/api/studios', { method: 'POST', body: { name: 'Timing Studio' } })
await api('/api/projects', { method: 'POST', body: { name: 'Big Source', studio_id: studio.id } })

const line = i => `Line ${i}: the keeper of tower ${i} counts ${i * 7} gulls before the tide turns at the harbor.`
const lines = Array.from({ length: N }, (_, i) => line(i + 1))
const v1 = (await upload('big.md', lines.join('\n\n'))).results[0]
const doc = await api(`/api/documents/${v1.document_id}`)
assert.equal(doc.passages.length, N, 'one passage per paragraph')
for (let k = 0; k < C; k++) {
  const i = Math.round((k + 0.5) * N / C)
  const p = doc.passages[i - 1]
  await api('/api/facts', { method: 'POST', body: { to: 'canon', document_id: doc.id, passage_id: p.id, quote: `tower ${i} counts ${i * 7} gulls`, kind: 'claim', subject: `Keeper ${i}`, predicate: 'counts', object: 'gulls', statement: `Keeper ${i} counts ${i * 7} gulls.` } })
}
lines[0] = 'Line 1: an uncited line, changed in v2.'
const [upMs, up] = await timed(() => upload('big.md', lines.join('\n\n')))
assert.equal(up.results[0].version, 2)
assert.equal(up.results[0].stale_facts, C, 'every fact cites v1')
assert.equal(up.results[0].outdated_facts, 0, 'no cited line changed')

for (const path of ['/api/facts?status=canon', '/api/stats']) {
  const times = []
  for (let k = 0; k < 6; k++) {
    const [ms, data] = await timed(() => api(path))
    if (path.startsWith('/api/facts')) assert.equal(data.filter(f => f.recheck === 'unchanged').length, C, 'all unchanged')
    times.push(ms)
  }
  console.log(`${path}: first read after upload (memo already warm) ${times[0].toFixed(0)} ms, warm median ${median(times.slice(1)).toFixed(0)} ms (${times.slice(1).map(t => t.toFixed(0)).join(', ')})`)
}
console.log(`v2 upload (${N} passages, ${C} citations classified): ${upMs.toFixed(0)} ms`)
