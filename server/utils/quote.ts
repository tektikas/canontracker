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

interface Folded { str: string, start: number[], end: number[], marks: Set<number>, pairs: { open: number, close: number, len: number }[] }

/** Folds `raw`; start[i]/end[i] are the raw offsets that folded UTF-16 unit i came from. */
export function foldQuoteText(raw: string): Folded {
  const pairs = emphasisPairs(raw)
  const marks = new Set(pairs.flatMap(p => [p.open, p.close].flatMap(i => Array.from({ length: p.len }, (_, k) => i + k))))
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
  return { str: units.map(u => u.c).join(''), start: units.map(u => u.s), end: units.map(u => u.e), marks, pairs }
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
    // lone delimiter, which re-folds as text: it is widened to the whole emphasised words, so a citation never splits a pair.
    let [ws, we] = [s, e]
    for (let grown = true; grown;) {
      grown = false
      for (const p of t.pairs) {
        const inOpen = p.open >= ws && p.open < we
        const inClose = p.close >= ws && p.close < we
        if (inOpen === inClose) continue
        ;[ws, we, grown] = [Math.min(ws, p.open), Math.max(we, p.close + p.len), true]
      }
    }
    const widened = (ws < s || we > e) && foldQuoteText(text.slice(ws, we)).str.includes(q) ? [ws, we] as const : undefined
    const at = ([[s, e], [s0, e0]] as const).find(([a, b]) => foldQuoteText(text.slice(a, b)).str === q) ?? widened
    if (!at) continue
    if (edges?.start && WORD_BEFORE.test(text.slice(Math.max(0, at[0] - 2), at[0]))) continue
    if (edges?.end && WORD_AFTER.test(text.slice(at[1], at[1] + 2))) continue
    yield text.slice(at[0], at[1])
  }
}
