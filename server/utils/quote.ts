// Quote matching that survives typography. Source and quote are compared in a folded form: NFD; curly quotes → straight;
// a run of consecutive dashes → one "-" (spaces around it ignored, so "a — b", "a—b" and "a -- b" meet; "a - - b" stays two
// runs); … → ...; any whitespace run, line breaks included → one space; paired Markdown emphasis delimiters and invisible
// soft hyphens / zero-width spaces dropped.
// A match is mapped back to the raw text: callers store the source's exact characters, never the folded ones.
// Only relative .ts imports, so scripts/quote-check.ts can run it under plain node.

import { emphasisPairs } from '../../shared/utils/emphasis.ts'

const FOLD: Record<string, string> = { '‘': '\'', '’': '\'', '‚': '\'', '‛': '\'', '“': '"', '”': '"', '„': '"', '‟': '"', '…': '...' }
const DASH = /[-‐‑‒–—―−]/
const DROP = /[­​﻿]/

// partner: each delimiter run's first offset → the other run of its pair (only read when a hit cuts a pair, see quoteHits).
interface Folded { str: string, start: number[], end: number[], marks: Set<number>, partner: Map<number, { open: number, close: number, len: number }> }

/** Folds `raw`; start[i]/end[i] are the raw offsets that folded UTF-16 unit i came from. */
export function foldQuoteText(raw: string): Folded {
  const marks = new Set<number>()
  const partner = new Map<number, { open: number, close: number, len: number }>()
  for (const p of emphasisPairs(raw)) {
    partner.set(p.open, p).set(p.close, p)
    for (let k = 0; k < p.len; k++) marks.add(p.open + k).add(p.close + k)
  }
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
  return { str: units.map(u => u.c).join(''), start: units.map(u => u.s), end: units.map(u => u.e), marks, partner }
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

// A letter, digit, mark or _ just before / after a hit (two UTF-16 units read, so a neighbour outside the BMP is one code point).
const WORD_BEFORE = /[\p{L}\p{N}\p{M}_]$/u
const WORD_AFTER = /^[\p{L}\p{N}\p{M}_]/u

/**
 * Every place `quote` occurs in `text` under folding, as the exact raw substring of `text` (overlapping hits counted).
 * Each returned substring folds back to exactly the folded quote; a hit that would not is dropped.
 * `t`: `text` already folded (foldQuoteText), for a caller that keeps its own folds.
 * `edges`: a hit must start (start) / end (end) at a word boundary in `text`, so a retried quote cannot land inside a word.
 */
export function quoteMatches(text: string, quote: string, t: Folded = folded(text), edges?: { start?: boolean, end?: boolean }): string[] {
  return [...quoteHits(text, quote, t, edges)]
}

// [s, e) grown until no emphasis pair has one delimiter inside and the other outside; undefined if nothing grows or the
// grown text no longer holds the quote.
function widen(text: string, t: Folded, s: number, e: number, q: string): readonly [number, number] | undefined {
  let [ws, we] = [s, e]
  for (let i = ws; i < we; i++) {
    const p = t.partner.get(i)
    if (!p) continue
    if (p.open < ws) { ws = p.open; i = ws - 1 } // grown leftwards: walk the new part too
    if (p.close + p.len > we) we = p.close + p.len
  }
  return (ws < s || we > e) && foldQuoteText(text.slice(ws, we)).str.includes(q) ? [ws, we] as const : undefined
}

/** quoteMatches one hit at a time, for a caller that stops at the first it can use (repetitive text has a hit per word). */
export function* quoteHits(text: string, quote: string, t: Folded = folded(text), edges?: { start?: boolean, end?: boolean }): Generator<string> {
  const q = foldQuoteText(quote).str
  if (!q) return
  for (let i = t.str.indexOf(q); i !== -1; i = t.str.indexOf(q, i + 1)) {
    const s0 = t.start[i]!
    const e0 = t.end[i + q.length - 1]!
    let s = s0
    let e = e0
    // Emphasis marks hugging the hit are taken in, so "Lantern is" cites "*Lantern* is", not "Lantern* is".
    while (t.marks.has(s - 1)) s--
    while (t.marks.has(e)) e++
    // A hit that cuts an emphasis pair in half (a selection from inside "_the Reminiscences of_" on to "JOHN") would leave a
    // lone delimiter, which re-folds as text: only then is it widened to the whole emphasised words, so a citation never splits
    // a pair. The usual hit never gets here, and widening only walks the hit's own characters.
    const at = ([[s, e], [s0, e0]] as const).find(([a, b]) => foldQuoteText(text.slice(a, b)).str === q) ?? widen(text, t, s, e, q)
    if (!at) continue
    if (edges?.start && WORD_BEFORE.test(text.slice(Math.max(0, at[0] - 2), at[0]))) continue
    if (edges?.end && WORD_AFTER.test(text.slice(at[1], at[1] + 2))) continue
    yield text.slice(at[0], at[1])
  }
}
