// Generates the landing illustrations from prompts.json through OmniRoute images (codex/gpt-image-2).
// Usage: OMNIROUTE_KEY="$(pass show <secret-entry> | head -1)" node scripts/brand/generate-art.mjs <out dir> [name...]
// Writes <out dir>/<name>.png (sources stay outside public/; optimise them with ImageMagick, see README.md).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [out, ...only] = process.argv.slice(2)
const key = process.env.OMNIROUTE_KEY
if (!out || !key) throw new Error('Usage: OMNIROUTE_KEY=… node scripts/brand/generate-art.mjs <out dir> [name...]')
mkdirSync(out, { recursive: true })
const spec = JSON.parse(readFileSync(new URL('./prompts.json', import.meta.url), 'utf8'))

// The gateway gives up (502) when the image takes too long to start; try each image three times.
async function generate(name, asset, attempt = 1) {
  try { await once(name, asset) }
  catch (e) { if (attempt >= 3) throw e; console.error(`${e.message.slice(0, 120)} (retrying)`); await generate(name, asset, attempt + 1) }
}

async function once(name, { prompt, size }) {
  const res = await fetch('https://gateway.example/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: spec.model, prompt, size, n: 1, background: spec.background }),
    signal: AbortSignal.timeout(600_000),
  })
  const body = await res.json().catch(() => ({}))
  const b64 = body.data?.[0]?.b64_json
  if (!res.ok || !b64) throw new Error(`${name}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`)
  writeFileSync(join(out, `${name}.png`), Buffer.from(b64, 'base64'))
  console.log(`${name}: written`)
}

const names = only.length ? only : Object.keys(spec.assets).filter(n => !existsSync(join(out, `${n}.png`)))
const results = await Promise.allSettled(names.map(n => generate(n, spec.assets[n])))
for (const r of results) if (r.status === 'rejected') console.error(r.reason.message)
if (results.some(r => r.status === 'rejected')) process.exitCode = 1
