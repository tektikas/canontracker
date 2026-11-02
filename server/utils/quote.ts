// Quote matching that survives typography. Source and quote are compared in a folded form: NFC; curly quotes → straight;
// any dash run → one "-" (spaces around it ignored, so "a — b", "a—b" and "a -- b" meet); … → ...; any whitespace run, line
// breaks included → one space; Markdown emphasis delimiters and invisible soft hyphens / zero-width spaces dropped.
// A match is mapped back to the raw text: callers store the source's exact characters, never the folded ones.
// No imports, so scripts/quote-check.ts can run it under plain node.

const FOLD: Record<string, string> = { '‘': '\'', '’': '\'', '‚': '\'', '‛': '\'', '“': '"', '”': '"', '„': '"', '‟': '"', '…': '...' }
const DASH = /[-‐‑‒–—―−]/
const DROP = /[­​﻿]/

interface Folded { str: string, start: number[], end: number[], marks: Set<number> }

/**
 * Raw offsets of `*` / `_` that are Markdown emphasis delimiters: a run that is left-flanking or right-flanking (CommonMark),
 * not both. Both-flanking runs (snake_case, 2*3, foo*bar) and free-standing ones (a * b, list bullets) are text and stay.
 */
function emphasisMarks(raw: string): Set<number> {
  const marks = new Set<number>()
  const ws = (c: string | undefined) => c === undefined || /\s/u.test(c)
  const punct = (c: string | undefined) => c !== undefined && /[\p{P}\p{S}]/u.test(c)
  for (const m of raw.matchAll(/\*+|_+/g)) {
    const prev = raw.slice(0, m.index).at(-1)
    const next = raw[m.index + m[0].length]
    const left = !ws(next) && (!punct(next) || ws(prev) || punct(prev))
    const right = !ws(prev) && (!punct(prev) || ws(next) || punct(next))
    if (left !== right) for (let i = 0; i < m[0].length; i++) marks.add(m.index + i)
  }
  return marks
}

/** Folds `raw`; start[i]/end[i] are the raw offsets that folded UTF-16 unit i came from. */
export function foldQuoteText(raw: string): Folded {
  const marks = emphasisMarks(raw)
  const units: { c: string, s: number, e: number }[] = []
  // A base char with its combining marks is one unit, so NFC can compose it without breaking the offset map.
  for (const m of raw.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const s = m.index
    const e = s + m[0].length
    for (const ch of m[0].normalize('NFC')) {
      const c = FOLD[ch] ?? (DASH.test(ch) ? '-' : /\s/.test(ch) ? ' ' : DROP.test(ch) || marks.has(s) ? '' : ch)
      // One entry per UTF-16 unit, so indexes into str (indexOf) and into start/end agree for astral chars (emoji).
      for (const x of c.split('')) {
        const last = units.at(-1)
        if (x === ' ' && (!last || last.c === ' ' || last.c === '-')) continue
        if (x === '-' && last?.c === '-') {
          last.e = e
          continue
        }
        if (x === '-' && last?.c === ' ') units.pop()
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
 */
export function quoteMatches(text: string, quote: string): string[] {
  const q = foldQuoteText(quote).str
  if (!q) return []
  const t = folded(text)
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
