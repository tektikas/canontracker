// Quote matching that survives typography. Source and quote are compared in a folded form: NFC; curly quotes → straight;
// any dash run → one "-" (spaces around it ignored, so "a — b", "a—b" and "a -- b" meet); … → ...; any whitespace run, line
// breaks included → one space; Markdown emphasis marks (* _) and invisible soft hyphens / zero-width spaces dropped.
// A match is mapped back to the raw text: callers store the source's exact characters, never the folded ones.
// No imports, so scripts/quote-check.ts can run it under plain node.

const FOLD: Record<string, string> = { '‘': '\'', '’': '\'', '‚': '\'', '‛': '\'', '“': '"', '”': '"', '„': '"', '‟': '"', '…': '...' }
const DASH = /[-‐‑‒–—―−]/
const DROP = /[*_­​﻿]/

interface Folded { str: string, start: number[], end: number[] }

/** Folds `raw`; start[i]/end[i] are the raw offsets that folded char i came from. */
export function foldQuoteText(raw: string): Folded {
  const units: { c: string, s: number, e: number }[] = []
  // A base char with its combining marks is one unit, so NFC can compose it without breaking the offset map.
  for (const m of raw.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const s = m.index
    const e = s + m[0].length
    for (const ch of m[0].normalize('NFC')) {
      const c = FOLD[ch] ?? (DASH.test(ch) ? '-' : /\s/.test(ch) ? ' ' : DROP.test(ch) ? '' : ch)
      for (const x of c) {
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
  return { str: units.map(u => u.c).join(''), start: units.map(u => u.s), end: units.map(u => u.e) }
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

/** Every place `quote` occurs in `text` under folding, as the exact raw substring of `text` (overlapping hits counted). */
export function quoteMatches(text: string, quote: string): string[] {
  const q = foldQuoteText(quote).str
  if (!q) return []
  const t = folded(text)
  const out: string[] = []
  for (let i = t.str.indexOf(q); i !== -1; i = t.str.indexOf(q, i + 1)) {
    let s = t.start[i]!
    let e = t.end[i + q.length - 1]!
    // Emphasis marks hugging the hit are taken in, so "Lantern is" cites "*Lantern* is", not "Lantern* is" (not inside a word: foo_bar).
    s -= /(?:^|[^\p{L}\p{N}])([*_]+)$/u.exec(text.slice(0, s))?.[1]!.length ?? 0
    e += /^([*_]+)(?![\p{L}\p{N}])/u.exec(text.slice(e))?.[1]!.length ?? 0
    out.push(text.slice(s, e))
  }
  return out
}
