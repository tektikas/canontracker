// Probe for server/utils/safe-fetch.ts (image downloads and capped API reads): node scripts/image-fetch-probe.mjs
// Needs internet: download checks use public https test hosts (httpbingo.org, postman-echo.com), because private and
// loopback addresses are exactly what downloadImage refuses. API-side limits run against a local http server.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire, syncBuiltinESMExports } from 'node:module'

// Rebinding check: after `rebind` is set, the first lookup of a host answers truthfully and every later one says 127.0.0.1.
const dnsp = createRequire(import.meta.url)('node:dns/promises')
const realLookup = dnsp.lookup
let rebind = null
dnsp.lookup = async (host, opts) => {
  if (host !== rebind?.host) return realLookup(host, opts)
  rebind.calls++
  return rebind.calls === 1 ? realLookup(host, opts) : opts?.all ? [{ address: '127.0.0.1', family: 4 }] : { address: '127.0.0.1', family: 4 }
}
syncBuiltinESMExports()
const { downloadImage, fetchCapped, FetchRefused, publicAddress } = await import('../server/utils/safe-fetch.ts')

const check = (label, ok) => { assert.ok(ok, label); console.log(`ok  ${label}`) }
const deadline = ms => AbortSignal.timeout(ms)
async function refused(label, p, pattern) {
  const e = await p.then(() => null, e => e)
  assert.ok(e, `${label}: expected a refusal`)
  assert.match(`${e.name} ${e.message}`, pattern, `${label}: ${e.name} ${e.message}`)
  console.log(`ok  ${label} (${e.message})`)
}

for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
  '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fc00::1', 'fd12::1', 'fe80::1', 'ff02::1', '64:ff9b::7f00:1', '2002:7f00:1::1', '2001::1', 'nope'])
  assert.equal(publicAddress(ip), false, ip)
for (const ip of ['8.8.8.8', '93.184.215.14', '2606:4700::1111']) assert.equal(publicAddress(ip), true, ip)
check('private, loopback, link-local, CGNAT, multicast, ULA, mapped and NAT64 addresses are refused; public ones pass', true)

const MB = 20_000_000
await refused('plain http URL refused', downloadImage('http://httpbingo.org/image/png', MB, deadline(10_000)), /only https/)
await refused('loopback IP refused', downloadImage('https://127.0.0.1:3531/files/0', MB, deadline(10_000)), /private network/)
await refused('IPv6 loopback refused', downloadImage('https://[::1]/x.png', MB, deadline(10_000)), /private network/)
await refused('IPv4-mapped loopback refused', downloadImage('https://[::ffff:127.0.0.1]/x.png', MB, deadline(10_000)), /private network/)
await refused('cloud metadata IP refused', downloadImage('https://169.254.169.254/latest', MB, deadline(10_000)), /private network/)
await refused('name resolving to loopback refused (localtest.me)', downloadImage('https://localtest.me/x.png', MB, deadline(10_000)), /private network/)
const redirect = to => `https://postman-echo.com/redirect-to?url=${encodeURIComponent(to)}`
await refused('public redirect to loopback refused', downloadImage(redirect('https://127.0.0.1:3531/files/0'), MB, deadline(15_000)), /private network/)
await refused('public redirect to a loopback name refused', downloadImage(redirect('https://localtest.me/x.png'), MB, deadline(15_000)), /private network/)
await refused('public redirect to http refused', downloadImage(redirect('http://httpbingo.org/image/png'), MB, deadline(15_000)), /only https/)
await refused('more than 3 redirects refused', downloadImage('https://httpbingo.org/redirect/5', MB, deadline(15_000)), /more than 3/)
await refused('oversize download (content-length) refused', downloadImage('https://httpbingo.org/bytes/50000', 10_000, deadline(15_000)), /larger than/)
await refused('oversize download (streamed, no length) aborted', downloadImage('https://httpbingo.org/stream-bytes/50000?chunk_size=1000', 10_000, deadline(15_000)), /larger than/)
let t = Date.now()
await refused('slow download body aborted by the deadline', downloadImage('https://httpbingo.org/drip?duration=10&numbytes=10&delay=0', MB, deadline(4_000)), /abort|timeout/i)
check(`  …after ${Date.now() - t} ms (deadline 4000)`, Date.now() - t < 8_000)
const png = await downloadImage('https://httpbingo.org/image/png', MB, deadline(15_000))
check(`public https PNG downloads (${png.length} bytes)`, png.subarray(1, 4).toString() === 'PNG')
const viaRedirect = await downloadImage('https://httpbingo.org/redirect-to?url=%2Fimage%2Fpng', MB, deadline(15_000))
check('same-host redirect to a PNG is followed', viaRedirect.equals(png))

// A host not contacted yet (so no kept-alive socket): a second lookup would say 127.0.0.1 and fail the connection.
rebind = { host: 'httpbin.org', calls: 0 }
const pinned = await downloadImage('https://httpbin.org/image/png', MB, deadline(15_000))
check(`DNS rebinding: one vetted lookup, connection pinned to it (${rebind.calls} lookup)`, rebind.calls === 1 && pinned.subarray(1, 4).toString() === 'PNG')
rebind = null

// API side: the configured endpoint is trusted, but its body is still bounded in size and time.
const server = createServer((req, res) => {
  if (req.url === '/trickle') {
    res.writeHead(200, { 'content-type': 'application/json' })
    const i = setInterval(() => res.write(' '), 500)
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
}).listen(0)
const api = `http://127.0.0.1:${server.address().port}`
t = Date.now()
await refused('slow API body aborted by the deadline', fetchCapped(`${api}/trickle`, {}, MB, deadline(2_000)), /abort|timeout/i)
check(`  …after ${Date.now() - t} ms (deadline 2000)`, Date.now() - t < 4_000)
await refused('oversize API body aborted at the cap', fetchCapped(`${api}/big`, {}, 1_000_000, deadline(10_000)), /larger than 1 MB/)
await refused('API redirect refused', fetchCapped(`${api}/redirect`, {}, MB, deadline(5_000)), /fetch failed|redirect/i)
check('small API body reads', (await fetchCapped(`${api}/ok`, {}, MB, deadline(5_000))).body.toString() === '{"ok":true}')
check('limit errors are FetchRefused', await fetchCapped(`${api}/big`, {}, 1_000, deadline(5_000)).catch(e => e instanceof FetchRefused))
server.close()
console.log('all checks passed')
