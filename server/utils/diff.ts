export type Op = { op: 'same', a: number, b: number } | { op: 'del', a: number } | { op: 'ins', b: number }

// Longest-common-subsequence diff of two lists. The shared head and tail are matched first, so a typical new version
// (a few edits) only runs the quadratic table on the edited middle.
// ponytail: a middle over 4M cells is reported as all removed + all added, a smarter diff (Myers) if huge rewrites matter.
export function diffSeq<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): Op[] {
  let head = 0
  while (head < a.length && head < b.length && eq(a[head]!, b[head]!)) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && eq(a[a.length - 1 - tail]!, b[b.length - 1 - tail]!)) tail++
  const n = a.length - head - tail
  const m = b.length - head - tail
  const out: Op[] = []
  for (let i = 0; i < head; i++) out.push({ op: 'same', a: i, b: i })
  if (n * m > 4_000_000) {
    for (let i = 0; i < n; i++) out.push({ op: 'del', a: head + i })
    for (let j = 0; j < m; j++) out.push({ op: 'ins', b: head + j })
  } else {
    // dp[i][j] = LCS length of a[head+i..] and b[head+j..]
    const w = m + 1
    const dp = new Uint32Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i * w + j] = eq(a[head + i]!, b[head + j]!) ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!)
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && eq(a[head + i]!, b[head + j]!)) out.push({ op: 'same', a: head + i++, b: head + j++ })
      else if (j < m && (i === n || dp[i * w + j + 1]! >= dp[(i + 1) * w + j]!)) out.push({ op: 'ins', b: head + j++ })
      else out.push({ op: 'del', a: head + i++ })
    }
  }
  for (let k = tail; k > 0; k--) out.push({ op: 'same', a: a.length - k, b: b.length - k })
  return out
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
