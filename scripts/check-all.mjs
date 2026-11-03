// Serial, isolated submission gate. No live credentials or developer database are used.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.CHECK_PORT ?? 4650)
if (!Number.isInteger(port) || port < 1024 || port > 65534) throw new Error('CHECK_PORT must be 1024–65534 (also uses CHECK_PORT+1)')
const base = `http://localhost:${port}`
const fake = `http://localhost:${port + 1}`
const work = await mkdtemp(join(tmpdir(), 'storybible-check-'))
const logs = join(work, 'logs')
await mkdir(logs)
console.log(`Check logs: ${logs}`)
const env = { ...process.env }
// Do not inherit live provider settings, keys, or developer sessions.
for (const key of Object.keys(env)) if (key.startsWith('NUXT_')) delete env[key]
Object.assign(env, { HOST: 'localhost', NUXT_MODEL_MODE: 'mock', NUXT_SESSION_PASSWORD: randomBytes(24).toString('hex') })
const children = new Set()
const failures = []
let sequence = 0

function launch(command, args, cwd, extra, log) {
  const stream = createWriteStream(log)
  const child = spawn(command, args, { cwd, env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
  children.add(child)
  child.stdout.pipe(stream, { end: false })
  child.stderr.pipe(stream, { end: false })
  child.done = new Promise(resolve => {
    child.once('error', error => { stream.write(`${error.message}\n`) })
    child.once('close', (code, signal) => {
      children.delete(child)
      stream.end(() => resolve({ code, signal }))
    })
  })
  return child
}
async function stop(child) {
  if (!child || !children.has(child)) return
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
  try { await child.done } finally { clearTimeout(timer) }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  for (const child of children) await stop(child)
  process.exit(signal === 'SIGINT' ? 130 : 143)
})
async function free(p) {
  const server = createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(p, 'localhost', resolve) })
  await new Promise(resolve => server.close(resolve))
}
async function run(label, command, args, { fatal = false } = {}) {
  const log = join(logs, `${String(++sequence).padStart(2, '0')}-${label}.log`)
  console.log(`Running ${label}`)
  const child = launch(command, args, root, {}, log)
  const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60_000)
  let result
  try { result = await child.done } finally { clearTimeout(timer) }
  const lines = (await readFile(log, 'utf8')).trimEnd().split('\n')
  console.log(lines.slice(-6).join('\n'))
  if (result.code !== 0) {
    failures.push(label)
    console.error(`FAIL ${label}: ${log}`)
    if (fatal) throw new Error(`${label} failed`)
  } else console.log(`PASS ${label}`)
}
async function start(label, p, mode = 'mock') {
  await free(p)
  const cwd = join(work, label)
  await mkdir(cwd)
  const child = launch(process.execPath, [join(root, '.output/server/index.mjs')], cwd,
    { PORT: String(p), NUXT_MODEL_MODE: mode, ...(mode === 'meta' ? { NUXT_META_BASE_URL: `${fake}/v1`, NUXT_META_API_KEY: 'contract-fixture-only' } : {}) }, join(logs, `${label}-server.log`))
  try {
    await ready(child, `http://localhost:${p}/api/health`)
    return { child, cwd }
  } catch (error) { await stop(child); throw error }
}
async function ready(child, url) {
  for (let i = 0; i < 200; i++) {
    if (!children.has(child)) throw new Error(`Server exited before ready: ${url}`)
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return } catch {}
    await delay(100)
  }
  throw new Error(`Server did not become ready: ${url}`)
}

try {
  await free(port)
  await free(port + 1)
  for (const tool of ['ffmpeg', 'ffprobe', 'unzip', 'xmllint', 'openssl', 'ss', 'git']) {
    // These probes exercise real file conversion, XML validation and migration history.
    const flag = tool === 'ss' || tool === 'unzip' ? '-h' : tool === 'openssl' ? 'version' : tool === 'git' || tool === 'xmllint' ? '--version' : '-version'
    await run(`prerequisite-${tool}`, tool, [flag], { fatal: true })
  }
  await run('typecheck', 'pnpm', ['exec', 'nuxi', 'typecheck'], { fatal: true })
  await run('build', 'pnpm', ['build'], { fatal: true })
  const scripts = (await readdir(join(root, 'scripts'))).sort()
  for (const script of scripts.filter(s => /-check\.(mjs|ts)$/.test(s))) await run(script, process.execPath, [`scripts/${script}`])
  const special = new Set(['image-fetch-probe.mjs', 'meta-contract-probe.mjs', 'severity-probe.mjs'])
  const dbProbes = new Set(['ashbell-probe.mjs', 'sherlock-probe.mjs', 'recheck-probe.mjs', 'mcp-probe.mjs', 'share-probe.mjs'])
  for (const script of scripts.filter(s => s.endsWith('-probe.mjs') && !special.has(s))) {
    // Restart for each probe so per-process rate limits cannot leak between suites.
    const { child, cwd } = await start(script, port)
    try {
      const args = [`scripts/${script}`, base]
      if (dbProbes.has(script)) args.push(join(cwd, '.data/storybible.db'))
      if (script === 'docx-probe.mjs') args.push(cwd)
      if (script === 'isolation-probe.mjs') args.push(join(cwd, '.data'))
      await run(script, process.execPath, args)
    } finally { await stop(child) }
  }
  const { child, cwd } = await start('merge-fuzz', port)
  try { await run('merge-fuzz', process.execPath, ['scripts/merge-fuzz.mjs', base, join(cwd, '.data/storybible.db'), '74', '100']) } finally { await stop(child) }
  for (const [script, mode] of [['severity-probe.mjs', 'migrate'], ['severity-probe.mjs', 'explicit'], ['image-upload-probe.mjs', 'migrate'], ['entity-types-probe.mjs', 'migrate']]) {
    await free(port + 1)
    await run(`${script}-${mode}`, process.execPath, [`scripts/${script}`, mode, String(port + 1)])
  }
  await run('image-fetch-probe.mjs', process.execPath, ['scripts/image-fetch-probe.mjs'])
  await free(port + 1)
  const fixture = launch(process.execPath, ['scripts/meta-fake.mjs', String(port + 1)], root, {}, join(logs, 'meta-fake.log'))
  try {
    await ready(fixture, `${fake}/_requests`)
    const app = await start('meta-contract', port, 'meta')
    try { await run('meta-contract-probe.mjs', process.execPath, ['scripts/meta-contract-probe.mjs', base, fake]) } finally { await stop(app.child) }
    await run('research-replay', process.execPath, ['scripts/research-replay.mjs', fake])
  } finally { await stop(fixture) }
} catch (error) {
  console.error(error.message)
  if (!failures.length) failures.push(error.message)
} finally {
  for (const child of children) await stop(child)
}
if (failures.length) {
  console.error(`Checks failed: ${failures.join(', ')}. Logs and isolated data: ${work}`)
  process.exitCode = 1
} else {
  // Keep logs for review; remove only the temporary databases this runner created.
  for (const name of await readdir(work)) if (name !== 'logs') await rm(join(work, name), { recursive: true, force: true })
  console.log(`All checks passed. Logs: ${logs}`)
}
