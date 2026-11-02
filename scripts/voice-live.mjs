// Live voice run (not in the gate; needs a server started with NUXT_MODEL_MODE=meta and a key that reaches Muse Voice Transcribe):
//   node scripts/voice-live.mjs http://localhost:<port> <clip> [<clip> ...] [--out <file.json>]
// A fresh account and project with the Ashbell Pass names as wiki pages (they are sent as recognition keywords), then each
// clip is uploaded as a recording. Prints per clip: turns with times, the transcript, extraction count, and the model calls
// (status, latency). --out writes the transcribed turns of every clip as JSON (used to record a sample's transcript).
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const [base, ...rest] = process.argv.slice(2)
const outAt = rest.indexOf('--out')
const out = outAt >= 0 ? rest.splice(outAt, 2)[1] : null
const clips = rest
if (!base || !clips.length) throw new Error('usage: node scripts/voice-live.mjs <baseUrl> <clip>... [--out file.json]')
const run = Date.now().toString(36)
let cookie = ''
async function call(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(base + path, { method, headers: form ? { cookie } : { 'content-type': 'application/json', cookie }, body: form ?? (body && JSON.stringify(body)) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const text = await res.text()
  try { return { status: res.status, data: JSON.parse(text) } } catch { return { status: res.status, data: text } }
}
const mmss = ms => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

await call('/api/auth/signup', { method: 'POST', body: { name: 'Live', email: `voice-live-${run}@probe.test`, password: 'correct horse' } })
const studio = (await call('/api/studios', { method: 'POST', body: { name: 'Voice Live' } })).data
await call('/api/projects', { method: 'POST', body: { name: 'Voice live run', studio_id: studio.id } })
const NAMES = [['Harl', 'character'], ['Captain Rourke', 'character'], ['Pell', 'character'], ['Ysolde', 'character'], ['Corin', 'character'], ['Mother Brisk', 'character'],
  ['Kettlehold', 'location'], ['Ember Well', 'location'], ['Bell Gate', 'location'], ['Cinder Bridge', 'location'], ['Salt Gate', 'location'], ['Kettle & Coal', 'location'],
  ['Red Mule Caravan', 'faction'], ['Pass Guard', 'faction']]
for (const [name, kind] of NAMES) await call('/api/entities', { method: 'POST', body: { name, kind } })

const recorded = []
for (const clip of clips) {
  const form = new FormData()
  form.append('file', new Blob([readFileSync(clip)]), basename(clip))
  const t0 = Date.now()
  const r = await call('/api/recordings', { method: 'POST', form })
  const ms = Date.now() - t0
  console.log(`\n=== ${basename(clip)}: HTTP ${r.status} in ${(ms / 1000).toFixed(1)} s`)
  const res = r.data.results?.[0]
  if (!res) { console.log(r.data); continue }
  const doc = (await call(`/api/documents/${res.document_id}`)).data
  for (const p of doc.passages) console.log(`  ${mmss(p.start_ms)}–${mmss(p.end_ms)}${p.speaker ? ` [${p.speaker}]` : ''}  ${p.text}`)
  console.log(`  candidates: ${res.candidates} (${res.unverified} unverified)${res.extraction_error ? `, extraction error: ${res.extraction_error}` : ''}`)
  recorded.push({ file: basename(clip), duration_ms: res.duration_ms, turns: doc.passages.map(p => ({ start_ms: p.start_ms, end_ms: p.end_ms, text: p.text, speaker: p.speaker })), facts: doc.facts.map(f => ({ statement: f.statement, quote: f.evidence[0]?.quote, verified: f.evidence[0]?.verified })) })
  for (const f of doc.facts) console.log(`    - ${f.statement}  [${f.evidence[0]?.verified ? 'verbatim' : 'quote not found'}]`)
}
const calls = (await call('/api/model-calls')).data
console.log('\nmodel calls:')
for (const c of [...calls].reverse()) console.log(`  ${c.purpose.padEnd(10)} ${c.model_id.padEnd(28)} ${c.status.padEnd(6)} ${String(c.latency_ms).padStart(6)} ms  ${c.output_summary ?? c.error ?? ''}`)
if (out) writeFileSync(out, JSON.stringify(recorded, null, 2))
