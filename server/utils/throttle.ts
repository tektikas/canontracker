import type { H3Event } from 'h3'

// ponytail: per-process fixed window per key; rejected requests are not counted, idle entries are evicted and the map is
// capped. Use a shared store if the app ever runs on several nodes.
/** `hit(key)` counts one request and returns 0, or, over `max` in the current window, the ms until the window resets.
 * `hit(key, false)` only checks, without counting (for limits that count failures only). `hit(key, n)` counts n units
 * (seconds of audio, say) and refuses when they would pass `max`; `hit(key, n, false)` checks that without counting. */
export function fixedWindow(max: number, windowMs: number, maxKeys = 1000) {
  const hits = new Map<string, { n: number, from: number }>()
  return (key: string, count: boolean | number = true, commit = count !== false) => {
    const w = typeof count === 'number' ? count : count ? 1 : 0
    const t = Date.now()
    let h = hits.get(key)
    if (!h || t - h.from >= windowMs) {
      if (hits.size >= maxKeys) {
        for (const [k, v] of hits) if (t - v.from >= windowMs) hits.delete(k)
        if (hits.size >= maxKeys) hits.delete(hits.keys().next().value!)
      }
      h = { n: 0, from: t }
      hits.set(key, h)
    }
    if (h.n >= max || h.n + w > max) return h.from + windowMs - t
    if (commit) h.n += w
    return 0
  }
}

/** The client's IP: Cloudflare's CF-Connecting-IP when the request came through Cloudflare (staging does: there the last
 * X-Forwarded-For hop can be a Cloudflare edge address shared by every visitor in a region), else the last X-Forwarded-For hop
 * (the one the proxy in front of the app saw; Traefik in deployment), else the socket address.
 * ponytail: the headers are the client's word when nothing in front sets them (the origin is only reachable through Cloudflare
 * or the LAN); fine for throttling, not for auth. */
export function clientIp(event: H3Event) {
  return getRequestHeader(event, 'cf-connecting-ip')?.trim() || getRequestHeader(event, 'x-forwarded-for')?.split(',').at(-1)?.trim() || getRequestIP(event) || 'unknown'
}
