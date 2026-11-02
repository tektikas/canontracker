import type { H3Event } from 'h3'

// ponytail: per-process fixed window per key; rejected requests are not counted, idle entries are evicted and the map is
// capped. Use a shared store if the app ever runs on several nodes.
/** `hit(key)` counts one request and returns 0, or, over `max` in the current window, the ms until the window resets.
 * `hit(key, false)` only checks, without counting (for limits that count failures only). */
export function fixedWindow(max: number, windowMs: number, maxKeys = 1000) {
  const hits = new Map<string, { n: number, from: number }>()
  return (key: string, count = true) => {
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
    if (h.n >= max) return h.from + windowMs - t
    if (count) h.n++
    return 0
  }
}

/** The client's IP: the last X-Forwarded-For hop (the one the proxy in front of the app saw; Traefik in deployment), else the
 * socket address. ponytail: without a proxy in front the header is the client's word; fine for throttling, not for auth. */
export function clientIp(event: H3Event) {
  return getRequestHeader(event, 'x-forwarded-for')?.split(',').at(-1)?.trim() || getRequestIP(event) || 'unknown'
}
