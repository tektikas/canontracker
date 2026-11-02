// Probe for server/utils/safe-fetch.ts (image downloads and capped API reads): node scripts/image-fetch-probe.mjs
// Runs offline against a local TLS fixture. Test-only interception (never in the app): DNS answers for *.test names are
// faked, and the TLS transport trusts the fixture's self-signed cert and, *after* downloadImage has vetted an address,
// connects to the fixture on 127.0.0.1 instead. That proves which address was vetted without any public host.
// One optional public smoke test runs at the end and is skipped when offline.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { connect as netConnect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const child = process.argv[2] === 'proxy-child'

// --- fixture: self-signed cert for the fake names, TLS server on loopback -----------------------------------------
const dir = child ? process.env.PROBE_DIR : mkdtempSync(join(tmpdir(), 'c15-probe-'))
if (!child) {
  try { execFileSync('openssl', ['version'], { stdio: 'ignore' }) } catch { console.error('image-fetch-probe needs the `openssl` command (it makes the throwaway TLS certificate). Install it and run again.'); process.exit(1) }
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=img.test',
    '-addext', 'subjectAltName=DNS:img.test,DNS:cdn.test,DNS:evil.test,DNS:rebind.test',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
}
const cert = readFileSync(join(dir, 'cert.pem'))
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64')

// --- interception: fake DNS + transport -----------------------------------------------------------------------------
// Fake public answers stand in for real hosts; evil.test is loopback; rebind.test answers public once, then loopback.
const PUBLIC = { 'img.test': '93.184.215.14', 'cdn.test': '8.8.4.4' }
const lookups = []
let rebindCalls = 0
const dnsp = require('node:dns/promises')
const realLookup = dnsp.lookup
dnsp.lookup = async (host, opts) => {
  if (!host.endsWith('.test')) return realLookup(host, opts)
  lookups.push(host)
  const address = PUBLIC[host] ?? (host === 'rebind.test' && ++rebindCalls === 1 ? '93.184.215.15' : '127.0.0.1')
  return opts?.all ? [{ address, family: 4 }] : { address, family: 4 }
}
syncBuiltinESMExports()

// What the socket was about to connect to (after vetting), then redirected to the fixture.
const vetted = []
let fixturePort = Number(process.env.PROBE_PORT) || 0
const tls = require('node:tls')
const realTlsConnect = tls.connect
tls.connect = (opts, ...rest) => {
  if (typeof opts !== 'object' || !String(opts.servername ?? opts.host).endsWith('.test')) return realTlsConnect.call(tls, opts, ...rest)
  const appLookup = opts.lookup
  return realTlsConnect.call(tls, {
    ...opts,
    ca: cert,
    port: fixturePort,
    lookup: appLookup && ((host, o, cb) => appLookup(host, o, (err, addr, fam) => {
      if (err) return cb(err, addr, fam)
      const list = Array.isArray(addr) ? addr : [{ address: addr, family: fam }]
      vetted.push(...list.map(a => a.address))
      const local = list.map(() => ({ address: '127.0.0.1', family: 4 }))
      return Array.isArray(addr) ? cb(null, local) : cb(null, '127.0.0.1', 4)
    })),
  }, ...rest)
}

const { downloadImage, fetchCapped, FetchRefused, publicAddress } = await import('../server/utils/safe-fetch.ts')
const check = (label, ok) => { assert.ok(ok, label); console.log(`ok  ${label}`) }
const deadline = ms => AbortSignal.timeout(ms)
// A download that never settles (e.g. the old 101 bug) fails here after 5 s instead of hanging the probe.
async function refused(label, p, pattern) {
  const hung = new Promise(r => setTimeout(r, 5_000, 'hung').unref())
  const e = await Promise.race([p.then(() => null, e => e), hung])
  assert.notEqual(e, 'hung', `${label}: never settled`)
  assert.ok(e, `${label}: expected a refusal`)
  assert.match(`${e.name} ${e.message}`, pattern, `${label}: ${e.name} ${e.message}`)
  console.log(`ok  ${label} (${e.message})`)
}
const MB = 20_000_000

// --- proxy child: NODE_USE_ENV_PROXY + HTTPS_PROXY must not route downloads around vettedLookup ----------------------
if (child) {
  await refused('[proxy env] name resolving to loopback refused', downloadImage('https://evil.test/png', MB, deadline(5_000)), /private network/)
  const png = await downloadImage('https://img.test/png', MB, deadline(5_000))
  check('[proxy env] public download connects directly to the vetted address', png.equals(PNG) && vetted.includes('93.184.215.14'))
  process.exit(0)
}

const fixture = createHttpsServer({ key: readFileSync(join(dir, 'key.pem')), cert }, (req, res) => {
  const url = new URL(req.url, 'https://x')
  const p = url.pathname
  if (p === '/png') return res.end(PNG)
  if (p === '/redirect') { res.writeHead(302, { location: url.searchParams.get('to') }); return res.end() }
  if (p.startsWith('/hops/')) {
    const n = Number(p.slice(6))
    res.writeHead(302, { location: n > 0 ? `/hops/${n - 1}` : '/png' })
    return res.end()
  }
  if (p === '/big') { res.writeHead(200, { 'content-length': 50_000 }); return res.end(Buffer.alloc(50_000)) }
  if (p === '/stream') {
    res.writeHead(200) // chunked, no content-length
    for (let i = 0; i < 50; i++) res.write(Buffer.alloc(1_000))
    return res.end()
  }
  if (p === '/drip') {
    res.writeHead(200, { 'content-type': 'image/png' })
    const i = setInterval(() => res.write('.'), 200)
    return res.on('close', () => clearInterval(i))
  }
  if (p === '/upgrade') return req.socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
  if (p === '/close') return req.socket.destroy()
  res.writeHead(404)
  res.end()
}).listen(0, '127.0.0.1')
await new Promise(r => fixture.once('listening', r))
fixturePort = fixture.address().port
const at = path => `https://img.test${path}`

// Addresses (IANA special-purpose registries).
for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '240.0.0.1',
  '255.255.255.255', '192.0.2.1', '198.18.0.1', '192.88.99.1', '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fc00::1', 'fd12::1', 'fe80::1',
  'ff02::1', '64:ff9b::7f00:1', '64:ff9b:1::1', '2002:7f00:1::1', '2001::1', '2001:2::1', '2001:10::1', '2001:db8::1', '3fff::1', '3fff:fff::1',
  '5f00::1', 'nope'])
  assert.equal(publicAddress(ip), false, ip)
for (const ip of ['8.8.8.8', '93.184.215.14', '2606:4700::1111', '2a00:1450::1', '2400:cb00::1']) assert.equal(publicAddress(ip), true, ip)
check('special-purpose IPv4/IPv6 (incl. benchmarking 2001:2::/48, documentation 3fff::/20) refused; public ones pass', true)

// Scheme and literal addresses.
await refused('plain http URL refused', downloadImage('http://img.test/png', MB, deadline(5_000)), /only https/)
await refused('URL with userinfo refused', downloadImage('https://u:p@img.test/png', MB, deadline(5_000)), /login/)
for (const host of ['127.0.0.1', '[::1]', '[::ffff:127.0.0.1]', '169.254.169.254', '[2001:2::1]', '[3fff::1]'])
  await refused(`literal ${host} refused`, downloadImage(`https://${host}/png`, MB, deadline(5_000)), /private network/)

// Vetted address and pinning.
lookups.length = vetted.length = 0
const png = await downloadImage(at('/png'), MB, deadline(5_000))
check(`public name downloads, socket connects to the vetted address (${vetted.join(', ')})`, png.equals(PNG) && vetted.join() === '93.184.215.14' && lookups.join() === 'img.test')
await refused('name resolving to loopback refused', downloadImage('https://evil.test/png', MB, deadline(5_000)), /private network/)
lookups.length = vetted.length = 0
const pinned = await downloadImage('https://rebind.test/png', MB, deadline(5_000))
check(`DNS rebinding: one vetted lookup, connection pinned to it (${rebindCalls} lookup, ${vetted.join()})`, pinned.equals(PNG) && rebindCalls === 1 && vetted.join() === '93.184.215.15')

// Redirects: each hop vetted again.
const redirect = to => at(`/redirect?to=${encodeURIComponent(to)}`)
await refused('redirect to a loopback name refused', downloadImage(redirect('https://evil.test/png'), MB, deadline(5_000)), /private network/)
await refused('redirect to a loopback IP refused', downloadImage(redirect(`https://127.0.0.1:${fixturePort}/png`), MB, deadline(5_000)), /private network/)
await refused('redirect to http refused', downloadImage(redirect('http://img.test/png'), MB, deadline(5_000)), /only https/)
await refused('redirect to a URL with userinfo refused', downloadImage(redirect('https://u:p@img.test/png'), MB, deadline(5_000)), /login/)
await refused('more than 3 redirects refused', downloadImage(at('/hops/4'), MB, deadline(5_000)), /more than 3/)
check('3 redirects are followed', (await downloadImage(at('/hops/2'), MB, deadline(5_000))).equals(PNG))
lookups.length = vetted.length = 0
const cross = await downloadImage(redirect('https://cdn.test/png'), MB, deadline(5_000))
check(`cross-host redirect vets the new host (${vetted.join(', ')})`, cross.equals(PNG) && vetted.includes('8.8.4.4') && lookups.includes('cdn.test'))

// Limits and deadlines.
await refused('oversize download (content-length) refused', downloadImage(at('/big'), 10_000, deadline(5_000)), /larger than/)
await refused('oversize download (streamed, no length) aborted', downloadImage(at('/stream'), 10_000, deadline(5_000)), /larger than/)
await refused('non-200 refused', downloadImage(at('/missing'), MB, deadline(5_000)), /answered 404/)
let t = Date.now()
await refused('slow download body aborted by the deadline', downloadImage(at('/drip'), MB, deadline(800)), /abort|timeout/i)
check(`  …after ${Date.now() - t} ms (deadline 800)`, Date.now() - t < 1_800)
t = Date.now()
await refused('101 Switching Protocols refused', downloadImage(at('/upgrade'), MB, deadline(800)), /switching protocols/)
check(`  …after ${Date.now() - t} ms, without waiting for the deadline`, Date.now() - t < 700)
await refused('connection closed before a response refused', downloadImage(at('/close'), MB, deadline(2_000)), /closed|socket hang up|ECONNRESET/)

// Proxy env: a child process with NODE_USE_ENV_PROXY=1 and HTTPS_PROXY at a local CONNECT proxy that tunnels to the fixture.
let tunnels = 0
const proxy = createHttpServer().on('connect', (req, sock) => {
  tunnels++
  const up = netConnect(fixturePort, '127.0.0.1', () => { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.pipe(sock); sock.pipe(up) })
  up.on('error', () => sock.destroy())
  sock.on('error', () => up.destroy())
}).listen(0, '127.0.0.1')
await new Promise(r => proxy.once('listening', r))
const proxyUrl = `http://127.0.0.1:${proxy.address().port}`
const code = await new Promise((resolve) => {
  spawn(process.execPath, [process.argv[1], 'proxy-child'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: proxyUrl, https_proxy: proxyUrl, NO_PROXY: '', no_proxy: '', PROBE_DIR: dir, PROBE_PORT: String(fixturePort) },
  }).on('exit', resolve)
})
check(`[proxy env] child passed and the proxy saw ${tunnels} tunnels`, code === 0 && tunnels === 0)
proxy.close()
fixture.close()
rmSync(dir, { recursive: true })

// API side: the configured endpoint is trusted, but its body is still bounded in size and time.
const server = createHttpServer((req, res) => {
  if (req.url === '/trickle') {
    res.writeHead(200, { 'content-type': 'application/json' })
    const i = setInterval(() => res.write(' '), 200)
    return res.on('close', () => clearInterval(i))
  }
  if (req.url === '/big') {
    res.writeHead(200, { 'content-type': 'application/json' })
    let sent = 0
    const pump = () => { while (sent < 50_000_000 && res.write(Buffer.alloc(65_536, 65))) sent += 65_536; if (sent < 50_000_000) res.once('drain', pump); else res.end() }
    return pump()
  }
  if (req.url === '/redirect') { res.writeHead(302, { location: '/big' }); return res.end() }
  res.end('{"ok":true}')
}).listen(0, '127.0.0.1')
await new Promise(r => server.once('listening', r))
const api = `http://127.0.0.1:${server.address().port}`
t = Date.now()
await refused('slow API body aborted by the deadline', fetchCapped(`${api}/trickle`, {}, MB, deadline(800)), /abort|timeout/i)
check(`  …after ${Date.now() - t} ms (deadline 800)`, Date.now() - t < 1_800)
await refused('oversize API body aborted at the cap', fetchCapped(`${api}/big`, {}, 1_000_000, deadline(10_000)), /larger than 1 MB/)
await refused('API redirect refused', fetchCapped(`${api}/redirect`, {}, MB, deadline(5_000)), /fetch failed|redirect/i)
check('small API body reads', (await fetchCapped(`${api}/ok`, {}, MB, deadline(5_000))).body.toString() === '{"ok":true}')
check('limit errors are FetchRefused', await fetchCapped(`${api}/big`, {}, 1_000, deadline(5_000)).catch(e => e instanceof FetchRefused))
server.close()

// Optional public smoke test (real DNS, real CA, real host); skipped when offline.
const online = await realLookup('httpbingo.org').then(() => true, () => false)
if (!online) console.log('skip public smoke test (offline)')
else {
  const real = await downloadImage('https://httpbingo.org/image/png', MB, deadline(15_000)).catch(e => e)
  if (real instanceof Error) console.log(`skip public smoke test (${real.message})`)
  else check(`public smoke: httpbingo.org PNG (${real.length} bytes)`, real.subarray(1, 4).toString() === 'PNG')
}
console.log('all checks passed')
