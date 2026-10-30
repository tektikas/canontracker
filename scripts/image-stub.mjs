// QA ONLY. A local stand-in for POST /images/generations so the success path can be tested without a funded key:
//   node scripts/image-stub.mjs 3531
//   NUXT_MODEL_MODE=meta NUXT_META_API_KEY=stub NUXT_META_BASE_URL=http://localhost:3531 pnpm dev
// Returns obvious test-pattern PNGs (not real model output). Prompt "stub:url" answers with data[].url, "stub:402" with
// billing_not_configured, "stub:junk" with a non-image payload. Chat calls (demo load in meta mode) replay the recorded
// Broken Tide extraction so a test project has candidates; rule checks and answers come back empty.
import { createServer } from 'node:http'
import { readFileSync, readdirSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'

const port = Number(process.argv[2] ?? 3531)
const fixtures = new URL('../server/assets/broken-tide/', import.meta.url)
const recorded = JSON.parse(readFileSync(new URL('candidates.json', fixtures), 'utf8'))
const docs = readdirSync(new URL('docs/', fixtures)).map(f => ({ f, text: readFileSync(new URL(`docs/${f}`, fixtures), 'utf8').trim() }))
const chat = (system, user) => (/extract/i.test(system)
  ? { candidates: recorded[docs.find(d => user.includes(d.text.slice(0, 200)))?.f] ?? [] }
  : /world rule/i.test(system) ? { violations: [] } : { answer: null, fact_ids: [] })

function png(seed, size = 256) {
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let x = 0; x < size; x++) {
      const band = Math.floor((x + y) / 32) % 2
      row[1 + x * 3] = (seed * 70 + x) % 256
      row[2 + x * 3] = band ? 90 : (y + seed * 40) % 256
      row[3 + x * 3] = 160 - seed * 25
    }
    rows.push(row)
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])))
    return Buffer.concat([len, Buffer.from(type), data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

createServer((req, res) => {
  const send = (status, body, type = 'application/json') => { res.writeHead(status, { 'content-type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body) }
  if (req.method === 'GET' && req.url?.startsWith('/files/')) return send(200, png(Number(req.url.slice(7)) || 0), 'image/png')
  if (req.method !== 'POST' || !['/images/generations', '/chat/completions'].includes(req.url)) return send(404, { error: { message: 'stub: not found' } })
  let raw = ''
  req.on('data', c => { raw += c })
  req.on('end', () => {
    const body = JSON.parse(raw || '{}')
    if (req.url === '/chat/completions')
      return send(200, { choices: [{ message: { content: JSON.stringify(chat(body.messages[0].content, body.messages[1].content)) } }] })
    console.log(`stub: ${body.model} n=${body.n} auth=${req.headers.authorization ? 'yes' : 'no'}`)
    const unknown = Object.keys(body).filter(k => !['model', 'prompt', 'n'].includes(k))
    if (unknown.length) return send(400, { error: { code: 'unknown_parameter', message: `unknown parameter: ${unknown[0]}` } })
    if (body.prompt?.includes('stub:402')) return send(402, { error: { code: 'billing_not_configured', message: 'Billing is not configured.' } })
    if (body.prompt?.includes('stub:junk')) return send(200, { data: [{ b64_json: Buffer.from('not an image').toString('base64') }] })
    const n = Math.max(1, Math.min(4, body.n ?? 1))
    const data = Array.from({ length: n }, (_, i) => body.prompt?.includes('stub:url')
      ? { url: `http://localhost:${port}/files/${i}` }
      : { b64_json: png(i).toString('base64') })
    setTimeout(() => send(200, { created: Math.floor(Date.now() / 1000), data }), 1500)
  })
}).listen(port, () => console.log(`image stub on http://localhost:${port}`))
