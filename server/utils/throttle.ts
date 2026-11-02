// ponytail: per-process fixed window per key; rejected requests are not counted, idle entries are evicted and the map is
// capped. Use a shared store if the app ever runs on several nodes.
/** `hit(key)` counts one request and returns 0, or, over `max` in the current window, the ms until the window resets. */
export function fixedWindow(max: number, windowMs: number, maxKeys = 1000) {
  const hits = new Map<string, { n: number, from: number }>()
  return (key: string) => {
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
    h.n++
    return 0
  }
}
