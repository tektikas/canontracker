// Size- and time-bounded HTTP for the model API, and SSRF-safe downloads of model-supplied URLs (images, cited pages).
// No Nuxt imports: scripts/image-fetch-probe.mjs runs this file directly with Node.
import { lookup } from 'node:dns/promises'
import type { IncomingMessage } from 'node:http'
import { Agent, request } from 'node:https'
import { BlockList, isIP } from 'node:net'
import type { LookupFunction } from 'node:net'

// A limit or policy refusal, worded for the user ("the image is larger than 20 MB").
export class FetchRefused extends Error {}

const mb = (n: number) => `${+(n / 1_000_000).toFixed(2)} MB`

// Reads a body, giving up as soon as it passes maxBytes. Leaving the loop early cancels the stream and its connection.
export async function readCapped(body: AsyncIterable<Uint8Array> | null, maxBytes: number, what: string) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of body ?? []) {
    size += c.length
    if (size > maxBytes) throw new FetchRefused(`${what} is larger than ${mb(maxBytes)}`)
    chunks.push(Buffer.from(c))
  }
  return Buffer.concat(chunks)
}

// For the configured API endpoint (trusted): `signal` bounds the request and the body; redirects are an error.
export async function fetchCapped(url: string, init: RequestInit, maxBytes: number, signal: AbortSignal) {
  const res = await fetch(url, { ...init, signal, redirect: 'error' })
  return { status: res.status, body: await readCapped(res.body as AsyncIterable<Uint8Array> | null, maxBytes, 'the response') }
}

const private4 = new BlockList()
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const)
  private4.addSubnet(net, bits, 'ipv4') // 224/3 = multicast + reserved + broadcast
// IPv6 must be global unicast (2000::/3), which already leaves out ::, ::1, IPv4-mapped/NAT64, ULA, link-local and multicast;
// inside it, the IANA special-purpose blocks that aren't globally reachable or can wrap a private IPv4 are refused:
// IETF protocol assignments (Teredo, benchmarking, ORCHID, …), documentation (2001:db8::/32, 3fff::/20) and 6to4.
// Deliberately conservative: the whole 2001::/23 block is refused, which also covers a few small globally reachable ranges inside it
// (2001:3::/32 AMT, 2001:4:112::/48 AS112). An image host there is rare; allow a range only with a test that proves it is safe.
const global6 = new BlockList()
global6.addSubnet('2000::', 3, 'ipv6')
const private6 = new BlockList()
for (const [net, bits] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) private6.addSubnet(net, bits, 'ipv6')

export function publicAddress(ip: string) {
  const v = isIP(ip)
  return v === 4 ? !private4.check(ip, 'ipv4') : v === 6 ? global6.check(ip, 'ipv6') && !private6.check(ip, 'ipv6') : false
}

// The socket connects to exactly the addresses vetted here, so a second DNS answer (rebinding) never reaches it.
const vettedLookup: LookupFunction = (host, opts, cb) => {
  lookup(host, { all: true, family: opts.family as 0 | 4 | 6 | undefined }).then((addrs) => {
    if (!addrs.length || addrs.some(a => !publicAddress(a.address)))
      return cb(new FetchRefused(`${host} points to a private network address`), '', 0)
    if (opts.all) cb(null, addrs)
    else cb(null, addrs[0]!.address, addrs[0]!.family)
  }, err => cb(err, '', 0))
}
// Its own agent: the global one may tunnel through HTTPS_PROXY (NODE_USE_ENV_PROXY), which never calls vettedLookup.
// Agent options override request options, so every connection goes through vettedLookup.
const directAgent = new Agent({ lookup: vettedLookup, proxyEnv: undefined })

// Downloads a URL handed to us by the model (an image, or a page a research answer cites): https only, public addresses
// only, at most 3 redirects (each hop checked again), body capped while streaming. `signal` is the caller's deadline for
// every hop and the body. `what` names the thing in refusals ("the image", "the page").
export async function safeGet(url: string, maxBytes: number, signal: AbortSignal, opts: { accept: string, what: string, agent: string }) {
  let next = new URL(url)
  const noun = opts.what.replace(/^the /, '')
  for (let hop = 0; hop <= 3; hop++) {
    if (next.protocol !== 'https:') throw new FetchRefused(`only https ${noun} URLs are allowed`)
    if (next.username || next.password) throw new FetchRefused(`${noun} URLs with a login are not allowed`)
    const host = next.hostname.replace(/^\[|\]$/g, '')
    if (isIP(host) && !publicAddress(host)) throw new FetchRefused(`${host} is a private network address`)
    // Every way a request can end settles this promise: response, error (incl. abort), upgrade, or a close before either.
    const res = await new Promise<IncomingMessage>((resolve, reject) =>
      request(next, { agent: directAgent, signal, headers: { 'accept': opts.accept, 'user-agent': opts.agent } }, resolve)
        .on('error', reject)
        .on('upgrade', (r, socket) => {
          socket.destroy()
          reject(new FetchRefused(`the ${noun} host answered ${r.statusCode} (switching protocols)`))
        })
        .on('close', () => reject(new FetchRefused(`the ${noun} host closed the connection`)))
        .end())
    const status = res.statusCode ?? 0
    if (status >= 300 && status < 400 && res.headers.location) {
      res.destroy()
      next = new URL(res.headers.location, next)
      continue
    }
    if (status !== 200) {
      res.destroy()
      throw new FetchRefused(`the ${noun} host answered ${status}`)
    }
    if (Number(res.headers['content-length']) > maxBytes) {
      res.destroy()
      throw new FetchRefused(`${opts.what} is larger than ${mb(maxBytes)}`)
    }
    return { body: await readCapped(res, maxBytes, opts.what), contentType: String(res.headers['content-type'] ?? ''), url: next.href }
  }
  throw new FetchRefused(`the ${noun} URL redirected more than 3 times`)
}

export async function downloadImage(url: string, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  return (await safeGet(url, maxBytes, signal, { accept: 'image/*', what: 'the image', agent: 'CanonTracker image download' })).body
}
