// Self-check for quote folding (server/utils/quote.ts). Run: node scripts/quote-check.ts
// Every hit must be the source's exact raw substring; absent quotes must find nothing.
import assert from 'node:assert/strict'
import { foldQuoteText, quoteMatches } from '../server/utils/quote.ts'

const one = (text: string, quote: string, want: string) => {
  const hits = quoteMatches(text, quote)
  assert.deepEqual(hits, [want], `${JSON.stringify(quote)} in ${JSON.stringify(text)}`)
  assert.ok(text.includes(hits[0]!), 'hit is a raw substring')
}

// Curly quotes, both directions.
one('Mara said “the tide is ours” and left.', 'said "the tide is ours"', 'said “the tide is ours”')
one('It isn’t the keeper’s fault.', 'isn\'t the keeper\'s', 'isn’t the keeper’s')
one('He said "go".', 'He said “go”', 'He said "go"')
// Dashes: em/en/ASCII, with or without spaces.
one('Arin—the keeper—waits.', 'Arin - the keeper - waits', 'Arin—the keeper—waits')
one('Arin – the keeper waits.', 'Arin--the keeper', 'Arin – the keeper')
one('Days 3–5 at sea.', 'Days 3-5 at sea', 'Days 3–5 at sea')
// Ellipsis.
one('She waited… and waited.', 'waited... and', 'waited… and')
// Markdown emphasis.
one('The *Lantern* is **never** lit at dusk.', 'The Lantern is never lit', 'The *Lantern* is **never** lit')
one('A _quiet_ harbour wall.', 'A quiet harbour', 'A _quiet_ harbour')
one('Arin is never lit.', 'Arin is *never* lit', 'Arin is never lit')
// Marks hugging the hit come along (balanced highlight), but not from inside a word.
one('The *Lantern* is **never** lit.', 'Lantern is never', '*Lantern* is **never**')
one('The *Lantern* is lit *at dusk*; then dark.', 'lit at dusk', 'lit *at dusk*')
one('Set keeper_mode on the lamp now.', 'keeper_mode on the lamp', 'keeper_mode on the lamp')
one('Run foo_bar before the lamp.', 'Run foo', 'Run foo')
// Line breaks and whitespace runs, NBSP.
one('Arin waits on the\nharbour wall  until\r\ndawn.', 'waits on the harbour wall until dawn', 'waits on the\nharbour wall  until\r\ndawn')
one('Arin waits by the wall.', 'Arin waits by', 'Arin waits by')
// NFC: decomposed source, composed quote, and back; the offset map keeps the raw (decomposed) characters.
one('Café Noir opens at dawn.', 'Café Noir opens', 'Café Noir opens')
one('Café Noir opens at dawn.', 'Café Noir opens', 'Café Noir opens')
// Offset mapping: hit starts and ends on the right raw chars with everything mixed in front of it.
one('“A” — *b*\n… then Arin’s “boat” left.', 'Arin\'s "boat" left', 'Arin’s “boat” left')
assert.deepEqual(foldQuoteText('a — *b*\n…').str, 'a-b ...')
const f = foldQuoteText('x\n\n*y*')
assert.equal(f.str, 'x y')
assert.deepEqual([f.start[2], f.end[2]], [4, 5])
// Repeats are all reported (the importer moves evidence only for exactly one).
assert.equal(quoteMatches('the tide—the tide', 'the tide').length, 2)
// Absent stays absent; blank/marks-only quote finds nothing.
assert.deepEqual(quoteMatches('Mara said “the tide is ours”.', 'the tide is mine'), [])
assert.deepEqual(quoteMatches('Arin waits.', 'arin waits'), [], 'case still matters')
assert.deepEqual(quoteMatches('Arin waits.', '** __'), [])
console.log('ok  quote folding: quotes, dashes, ellipsis, Markdown, line breaks, NFC, offsets, absent')
