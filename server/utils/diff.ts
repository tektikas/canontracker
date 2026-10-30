export type Op = { op: 'same', a: number, b: number } | { op: 'del', a: number } | { op: 'ins', b: number }

const LCS_CELLS = 1_000_000

// Diff of two lists by key, exact at any size. Each range first matches its shared head and tail. A small middle gets the
// longest-common-subsequence table. A large one is split at anchors (patience diff: keys that occur once on each side, the
// longest run in the same order on both) and every gap between anchors is aligned the same way, so an untouched item is
// never reported as changed just because the list is long.
export function diffSeq<T>(a: T[], b: T[], key: (x: T) => unknown = x => x): Op[] {
  const ka = a.map(key)
  const kb = b.map(key)
  const pairs: [number, number][] = []
  const ranges: [number, number, number, number][] = [[0, a.length, 0, b.length]]
  while (ranges.length) {
    let [a0, a1, b0, b1] = ranges.pop()!
    while (a0 < a1 && b0 < b1 && ka[a0] === kb[b0]) pairs.push([a0++, b0++])
    while (a0 < a1 && b0 < b1 && ka[a1 - 1] === kb[b1 - 1]) pairs.push([--a1, --b1])
    const n = a1 - a0
    const m = b1 - b0
    if (!n || !m) continue
    if (n * m <= LCS_CELLS) {
      // dp[i][j] = LCS length of a[a0+i..a1) and b[b0+j..b1)
      const w = m + 1
      const dp = new Uint32Array((n + 1) * w)
      for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
          dp[i * w + j] = ka[a0 + i] === kb[b0 + j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!)
      for (let i = 0, j = 0; i < n && j < m;) {
        if (ka[a0 + i] === kb[b0 + j]) pairs.push([a0 + i++, b0 + j++])
        else if (dp[i * w + j + 1]! >= dp[(i + 1) * w + j]!) j++
        else i++
      }
      continue
    }
    let pa = a0
    let pb = b0
    for (const [i, j] of anchors(ka, kb, a0, a1, b0, b1)) {
      ranges.push([pa, i, pb, j])
      pairs.push([i, j])
      pa = i + 1
      pb = j + 1
    }
    if (pa > a0) ranges.push([pa, a1, pb, b1])
  }
  pairs.sort((x, y) => x[0] - y[0])
  const out: Op[] = []
  let i = 0
  let j = 0
  for (const [pa, pb] of pairs) {
    while (i < pa) out.push({ op: 'del', a: i++ })
    while (j < pb) out.push({ op: 'ins', b: j++ })
    out.push({ op: 'same', a: i++, b: j++ })
  }
  while (i < a.length) out.push({ op: 'del', a: i++ })
  while (j < b.length) out.push({ op: 'ins', b: j++ })
  return out
}

// Matched positions in increasing order on both sides; empty only when the two ranges share no key at all.
function anchors(ka: unknown[], kb: unknown[], a0: number, a1: number, b0: number, b1: number): [number, number][] {
  const at = new Map<unknown, { a: number[], b: number[] }>()
  for (let i = a0; i < a1; i++) {
    const s = at.get(ka[i])
    if (s) s.a.push(i)
    else at.set(ka[i], { a: [i], b: [] })
  }
  for (let j = b0; j < b1; j++) at.get(kb[j])?.b.push(j)
  const unique = [...at.values()].filter(s => s.a.length === 1 && s.b.length === 1).map(s => [s.a[0]!, s.b[0]!] as [number, number])
  if (!unique.length) {
    // ponytail: no key is unique on both sides (only repeats), so pair the rarest shared key's occurrences in order; fine for
    // prose, where whole passages rarely repeat. Optimal here would need a full LCS of the range.
    let rare: { a: number[], b: number[] } | undefined
    for (const s of at.values()) if (s.b.length && (!rare || s.a.length + s.b.length < rare.a.length + rare.b.length)) rare = s
    const r = rare
    return r ? r.a.slice(0, r.b.length).map((i, k) => [i, r.b[k]!]) : []
  }
  // Longest run increasing in b (the list is already in a order): patience sorting with back links.
  const tails: number[] = []
  const back = new Int32Array(unique.length)
  unique.forEach(([, j], p) => {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (unique[tails[mid]!]![1] < j) lo = mid + 1
      else hi = mid
    }
    back[p] = lo ? tails[lo - 1]! : -1
    tails[lo] = p
  })
  const run: [number, number][] = []
  for (let p = tails.at(-1)!; p >= 0; p = back[p]!) run.push(unique[p]!)
  return run.reverse()
}

/** Word-level diff of two strings: runs of unchanged, removed and added text (whitespace kept). */
export function diffWords(a: string, b: string) {
  const ta = a.split(/(\s+)/)
  const tb = b.split(/(\s+)/)
  const runs: { t: 'same' | 'del' | 'ins', text: string }[] = []
  for (const o of diffSeq(ta, tb)) {
    const [t, text] = o.op === 'same' ? ['same', ta[o.a]!] as const : o.op === 'del' ? ['del', ta[o.a]!] as const : ['ins', tb[o.b]!] as const
    if (runs.at(-1)?.t === t) runs.at(-1)!.text += text
    else runs.push({ t, text })
  }
  return runs
}

/** Share of two strings' characters that a word diff keeps unchanged (0..1). */
export function similarity(a: string, b: string) {
  const same = diffWords(a, b).filter(r => r.t === 'same').reduce((n, r) => n + r.text.length, 0)
  return a.length + b.length ? (2 * same) / (a.length + b.length) : 1
}
