// Quote matching that survives typography. Source and quote are compared in a folded form: NFD; curly quotes → straight;
// a run of consecutive dashes → one "-" (spaces around it ignored, so "a — b", "a—b" and "a -- b" meet; "a - - b" stays two
// runs); … → ...; any whitespace run, line breaks included → one space; paired Markdown emphasis delimiters and invisible
// soft hyphens / zero-width spaces dropped.
// A match is mapped back to the raw text: callers store the source's exact characters, never the folded ones.
// No imports, so scripts/quote-check.ts can run it under plain node.

const FOLD: Record<string, string> = { '‘': '\'', '’': '\'', '‚': '\'', '‛': '\'', '“': '"', '”': '"', '„': '"', '‟': '"', '…': '...' }
const DASH = /[-‐‑‒–—―−]/
const DROP = /[­​﻿]/

interface Folded { str: string, start: number[], end: number[], marks: Set<number> }

/**
 * Raw offsets of `*` / `_` that are Markdown emphasis delimiters. Only pairs count: an opening run and a later closing run of
 * the same char and length (`*x*`, `**x**`, `_x_`, `__x__`), CommonMark flanking rules. An unpaired mark is text and stays,
 * so `2 *3` or a stray leading `*` must be typed. `_` opens/closes only at a word boundary (snake_case is text); a pair of two
 * intra-word `*` runs (2*3 and 4*5) is text too, but one intra-word side is fine (`*Bright*star`). A `*` / `_` inside a
 * backtick code span or after a backslash is literal and never pairs.
 */
function emphasisMarks(source: string): Set<number> {
  const marks = new Set<number>()
  // Code spans (matching backtick runs) and backslash escapes, scanned left to right: their marks become '#' (literal punctuation).
  const raw = source.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)|\\[\s\S]/g, m => m.replace(/[*_]/g, '#'))
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
      for (const i of [open[at]!.i, m.index]) for (let k = 0; k < m[0].length; k++) marks.add(i + k)
      open.length = at
    }
    else if (canOpen) open.push({ i: m.index, run: m[0], both })
  }
  return marks
}

/** Folds `raw`; start[i]/end[i] are the raw offsets that folded UTF-16 unit i came from. */
export function foldQuoteText(raw: string): Folded {
  const marks = emphasisMarks(raw)
  const units: { c: string, s: number, e: number }[] = []
  let gap = false // whitespace seen after a dash: a following dash starts a new run, not the same one
  // NFD per base char + its combining marks: decomposing never needs a neighbour (Hangul jamo, é vs e + ´ meet), so every
  // folded unit still maps to the raw chars it came from.
  for (const m of raw.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const s = m.index
    const e = s + m[0].length
    for (const ch of m[0].normalize('NFD')) {
      const c = FOLD[ch] ?? (DASH.test(ch) ? '-' : /\s/.test(ch) ? ' ' : DROP.test(ch) || marks.has(s) ? '' : ch)
      // One entry per UTF-16 unit, so indexes into str (indexOf) and into start/end agree for astral chars (emoji).
      for (const x of c.split('')) {
        const last = units.at(-1)
        if (x === ' ' && last?.c === '-') gap = true
        if (x === ' ' && (!last || last.c === ' ' || last.c === '-')) continue
        if (x === '-' && last?.c === '-') {
          if (!gap) {
            last.e = e
            continue
          }
          units.push({ c: ' ', s, e: s }) // two dash runs apart: "a - - b" folds to "a- -b", never "a-b"
        }
        if (x === '-' && last?.c === ' ') units.pop()
        gap = false
        units.push({ c: x, s, e })
      }
    }
  }
  if (units.at(-1)?.c === ' ') units.pop()
  return { str: units.map(u => u.c).join(''), start: units.map(u => u.s), end: units.map(u => u.e), marks }
}

// ponytail: bounded memo so extraction (candidates × passages) folds each passage once; cleared wholesale when full.
const memo = new Map<string, Folded>()
const folded = (raw: string) => {
  let f = memo.get(raw)
  if (!f) {
    if (memo.size > 2000) memo.clear()
    memo.set(raw, f = foldQuoteText(raw))
  }
  return f
}

/**
 * Every place `quote` occurs in `text` under folding, as the exact raw substring of `text` (overlapping hits counted).
 * Each returned substring folds back to exactly the folded quote; a hit that would not is dropped.
 * `t`: `text` already folded (foldQuoteText), for a caller that keeps its own folds.
 */
export function quoteMatches(text: string, quote: string, t: Folded = folded(text)): string[] {
  const q = foldQuoteText(quote).str
  if (!q) return []
  const out: string[] = []
  for (let i = t.str.indexOf(q); i !== -1; i = t.str.indexOf(q, i + 1)) {
    let s = t.start[i]!
    let e = t.end[i + q.length - 1]!
    // Emphasis marks hugging the hit are taken in, so "Lantern is" cites "*Lantern* is", not "Lantern* is".
    const bare = text.slice(s, e)
    while (t.marks.has(s - 1)) s--
    while (t.marks.has(e)) e++
    const hit = [text.slice(s, e), bare].find(raw => foldQuoteText(raw).str === q)
    if (hit) out.push(hit)
  }
  return out
}
