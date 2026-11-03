// Records the Sherlock Holmes sample's extraction (server/assets/sherlock-holmes/candidates.json), the output recorded mode
// replays for the sample's own text. Runs the app's real extraction (extractCandidates in server/utils/model.ts: the same
// prompt, request and cleaning as a live import) against an OpenAI-compatible endpoint, several documents at a time, with
// Nitro's globals replaced by plain stand-ins (like scripts/research-replay.mjs). Not a gate; needs a key:
//   SB_BASE_URL=https://gateway.example/v1 SB_MODEL_ID=codex/gpt-6-luna SB_API_KEY="$(pass show …)" \
//     node scripts/sherlock-record.mjs [--only <file,file…>] [--concurrency 4]
// Writes only when every document's call succeeded (a failed one is retried once). Prints calls, candidates, drops and time.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as storyTime from '../shared/utils/story-time.ts'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const only = arg('--only')
const concurrency = Number(arg('--concurrency', 4))
const { SB_BASE_URL: baseUrl, SB_MODEL_ID: modelId, SB_API_KEY: key } = process.env
if (!baseUrl || !modelId || !key) throw new Error('set SB_BASE_URL, SB_MODEL_ID and SB_API_KEY')
const dir = new URL('../server/assets/sherlock-holmes/', import.meta.url)
const calls = []
Object.assign(globalThis, storyTime, {
  useRuntimeConfig: () => ({ metaBaseUrl: baseUrl, modelId, metaApiKey: key, modelMode: 'meta' }),
  useDb: () => ({ prepare: () => ({ run: (...a) => calls.push({ target: a[5], status: a[8], ms: a[9], summary: a[10], error: a[11] }) }) }),
  pid: () => 'record', newId: p => `${p}_${calls.length}`, now: () => new Date().toISOString(),
  createError: o => Object.assign(new Error(o.message), o),
  $fetch: async (url, o = {}) => {
    const res = await fetch(url, { method: o.method ?? 'GET', headers: { 'content-type': 'application/json', ...o.headers }, body: o.body && JSON.stringify(o.body), signal: AbortSignal.timeout(o.timeout ?? 60_000) })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { statusCode: res.status, data })
    return data
  },
})
const { extractCandidates, PROMPT_VERSIONS } = await import('../server/utils/model.ts')

const files = readdirSync(new URL('docs/', dir)).filter(f => f.endsWith('.md') && (!only || only.split(',').includes(f))).sort()
const out = {}
const started = Date.now()
let next = 0
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < files.length) {
    const file = files[next++]
    const text = readFileSync(new URL(`docs/${file}`, dir), 'utf8')
    const doc = { id: file, filename: file, title: text.match(/^#\s+(.+)$/m)?.[1] ?? file, text }
    for (let attempt = 1; ; attempt++) {
      const t = Date.now()
      try {
        out[file] = await extractCandidates(doc)
        console.log(`ok   ${file}: ${calls.at(-1).summary} in ${((Date.now() - t) / 1000).toFixed(1)} s`)
        break
      } catch (e) {
        console.log(`FAIL ${file} (attempt ${attempt}): ${e.message}`)
        if (attempt === 2) return
      }
    }
  }
}))
const seconds = (Date.now() - started) / 1000
const ok = calls.filter(c => c.status === 'ok')
const n = Object.values(out).reduce((s, c) => s + c.length, 0)
console.log(`\n${ok.length} ok / ${calls.length} calls, ${n} candidates, ${Math.round(seconds)} s wall, ${(ok.reduce((s, c) => s + c.ms, 0) / ok.length / 1000).toFixed(1)} s per call`)
if (Object.keys(out).length !== files.length) { console.log('not written: some documents failed'); process.exit(1) }
const path = new URL('candidates.json', dir)
const prev = only && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
const note = `Recorded ${new Date().toISOString().slice(0, 10)} by scripts/sherlock-record.mjs: ${modelId} via ${new URL(baseUrl).host} (OpenAI-compatible gateway), prompt ${PROMPT_VERSIONS.extract}, cleaned by cleanCandidates exactly as a live import; quotes as the model wrote them. Not a Muse run.`
const merged = { _note: prev._note ?? note, ...Object.fromEntries(Object.entries({ ...prev, ...out }).filter(([k]) => k !== '_note').sort(([a], [b]) => a.localeCompare(b))) }
writeFileSync(path, `{\n${Object.entries(merged).map(([k, v]) => `  ${JSON.stringify(k)}: ${k === '_note' ? JSON.stringify(v) : `[\n${v.map(c => `    ${JSON.stringify(c)}`).join(',\n')}\n  ]`}`).join(',\n')}\n}\n`)
console.log(`wrote ${path.pathname}`)
