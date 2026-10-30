// Size- and time-bounded HTTP for the image model, and SSRF-safe downloads of model-supplied image URLs.
// No Nuxt imports: scripts/image-fetch-probe.mjs runs this file directly with Node.
import { lookup } from 'node:dns/promises'
import type { IncomingMessage } from 'node:http'
import { request } from 'node:https'
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
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const)
  private4.addSubnet(net, bits, 'ipv4') // 224/3 = multicast + reserved + broadcast
// IPv6 must be global unicast (2000::/3), which already leaves out ::, ::1, IPv4-mapped/NAT64, ULA, link-local and multicast;
// Teredo, documentation and 6to4 can still wrap a private IPv4, so they are refused too.
const global6 = new BlockList()
global6.addSubnet('2000::', 3, 'ipv6')
const private6 = new BlockList()
for (const [net, bits] of [['2001::', 32], ['2001:db8::', 32], ['2002::', 16]] as const) private6.addSubnet(net, bits, 'ipv6')

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

// Downloads an image URL handed to us by the model: https only, public addresses only, at most 3 redirects (each hop
// checked again), body capped while streaming. `signal` is the caller's deadline for every hop and the body.
export async function downloadImage(url: string, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  let next = new URL(url)
  for (let hop = 0; hop <= 3; hop++) {
    if (next.protocol !== 'https:') throw new FetchRefused('only https image URLs are allowed')
    const host = next.hostname.replace(/^\[|\]$/g, '')
    if (isIP(host) && !publicAddress(host)) throw new FetchRefused(`${host} is a private network address`)
    const res = await new Promise<IncomingMessage>((resolve, reject) =>
      request(next, { lookup: vettedLookup, signal, headers: { 'accept': 'image/*', 'user-agent': 'StoryBible image download' } }, resolve).on('error', reject).end())
    const status = res.statusCode ?? 0
    if (status >= 300 && status < 400 && res.headers.location) {
      res.destroy()
      next = new URL(res.headers.location, next)
      continue
    }
    if (status !== 200) {
      res.destroy()
      throw new FetchRefused(`the image host answered ${status}`)
    }
    if (Number(res.headers['content-length']) > maxBytes) {
      res.destroy()
      throw new FetchRefused(`the image is larger than ${mb(maxBytes)}`)
    }
    return readCapped(res, maxBytes, 'the image')
  }
  throw new FetchRefused('the image URL redirected more than 3 times')
}
