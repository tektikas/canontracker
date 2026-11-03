// Markdown emphasis in source text (`*x*`, `_x_`, `**x**`). One parser for quote matching (server/utils/quote.ts folds the
// delimiters away) and for display (the reader hides them and shows the words in italics or bold; book exports drop them).
// The stored text never changes. No imports, so scripts/quote-check.ts runs it under plain node.

/**
 * Paired emphasis delimiter runs: an opening run and a later closing run of the same char and length (`*x*`, `**x**`, `_x_`,
 * `__x__`), CommonMark flanking rules. An unpaired mark is text and stays, so `2 *3` or a stray leading `*` must be typed.
 * `_` opens/closes only at a word boundary (snake_case is text); a pair of two intra-word `*` runs (2*3 and 4*5) is text too,
 * but one intra-word side is fine (`*Bright*star`). A `*` / `_` inside a backtick code span or after a backslash is literal
 * (an escaped backtick \` never closes a span) and never pairs.
 */
export function emphasisPairs(source: string): { open: number, close: number, len: number }[] {
  const pairs: { open: number, close: number, len: number }[] = []
  // Code spans (matching backtick runs) and backslash escapes, scanned left to right: their marks become '#' (literal punctuation).
  const raw = source.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<![`\\])\1(?!`)|\\[\s\S]/g, m => m.replace(/[*_]/g, '#'))
  const ws = (c: string | undefined) => c === undefined || /\s/u.test(c)
  const punct = (c: string | undefined) => c !== undefined && /[\p{P}\p{S}]/u.test(c)
  const open: { i: number, run: string, both: boolean }[] = []
  for (const m of raw.matchAll(/\*+|_+/g)) {
    const prev = raw.slice(0, m.index).at(-1)
    const next = raw[m.index + m[0].length]
    const left = !ws(next) && (!punct(next) || ws(prev) || punct(prev))
    const right = !ws(prev) && (!punct(prev) || ws(next) || punct(next))
    const star = m[0][0] === '*'
    const canOpen = left && (star || !right || punct(prev))
    const canClose = right && (star || !left || punct(next))
    const both = left && right
    const at = canClose ? open.findLastIndex(o => o.run === m[0] && !(o.both && both)) : -1
    if (at !== -1) {
      pairs.push({ open: open[at]!.i, close: m.index, len: m[0].length })
      open.length = at
    }
    else if (canOpen) open.push({ i: m.index, run: m[0], both })
  }
  return pairs
}

/** Raw offsets of every paired delimiter character. */
export function emphasisMarks(source: string): Set<number> {
  const marks = new Set<number>()
  for (const p of emphasisPairs(source)) for (const i of [p.open, p.close]) for (let k = 0; k < p.len; k++) marks.add(i + k)
  return marks
}

export interface EmphasisRun { text: string, start: number, mark: boolean, em: boolean, strong: boolean }
/**
 * The text cut into runs that share a style: `mark` runs are the delimiters themselves (hidden or dropped on display), the
 * others carry em (`*x*`, `_x_`, `***x***`) and/or strong (`**x**`, `__x__`). Joining every run's text gives the input back.
 */
export function emphasisRuns(text: string): EmphasisRun[] {
  const em = new Array<number>(text.length + 1).fill(0)
  const strong = new Array<number>(text.length + 1).fill(0)
  const marks = new Set<number>()
  for (const p of emphasisPairs(text)) {
    for (const i of [p.open, p.close]) for (let k = 0; k < p.len; k++) marks.add(i + k)
    // Difference arrays: +1 where the styled words start, -1 where they end.
    if (p.len !== 2) { em[p.open + p.len]!++; em[p.close]!-- }
    if (p.len >= 2) { strong[p.open + p.len]!++; strong[p.close]!-- }
  }
  const runs: EmphasisRun[] = []
  let e = 0
  let s = 0
  for (let i = 0; i < text.length; i++) {
    e += em[i]!
    s += strong[i]!
    const style = { mark: marks.has(i), em: e > 0, strong: s > 0 }
    const last = runs.at(-1)
    if (last && last.mark === style.mark && last.em === style.em && last.strong === style.strong) last.text += text[i]
    else runs.push({ text: text[i]!, start: i, ...style })
  }
  return runs
}
