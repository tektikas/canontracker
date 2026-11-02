// Self-check for quote folding (server/utils/quote.ts). Run: node scripts/quote-check.ts
// Every hit must be the source's exact raw substring; absent quotes must find nothing.
import assert from 'node:assert/strict'
import { foldQuoteText, quoteMatches } from '../server/utils/quote.ts'

const one = (text: string, quote: string, want: string) => {
  const hits = quoteMatches(text, quote)
  assert.deepEqual(hits, [want], `${JSON.stringify(quote)} in ${JSON.stringify(text)}`)
  assert.ok(text.includes(hits[0]!), 'hit is a raw substring')
  assert.equal(foldQuoteText(hits[0]!).str, foldQuoteText(quote).str, 'hit re-folds to the submitted quote')
}
const none = (text: string, quote: string) => assert.deepEqual(quoteMatches(text, quote), [], `${JSON.stringify(quote)} must not match ${JSON.stringify(text)}`)

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
// Not emphasis: intra-word _, * between digits/letters, free-standing * stay as text and must be typed.
none('snake_case is forbidden.', 'snakecase is forbidden')
none('2*3 equals six today.', '23 equals six today')
none('Use foo*bar here.', 'foobar here')
none('Rate 5 * 3 now.', 'Rate 5 3 now')
one('snake_case is forbidden.', 'snake_case is forbidden', 'snake_case is forbidden')
one('2*3 equals six today.', '2*3 equals six', '2*3 equals six')
one('Rate 5 * 3 now.', 'Rate 5 * 3', 'Rate 5 * 3')
// Only paired emphasis folds: an unmatched * / _ is literal text (attempt-3 repros).
none('2 *3 equals six today.', '2 3 equals six today')
one('2 *3 equals six today.', '2 *3 equals six today', '2 *3 equals six today')
none('Then *Arin waits at sea for the keeper.', 'Then Arin waits at sea')
one('Then *Arin waits at sea for the keeper.', 'Then *Arin waits at sea', 'Then *Arin waits at sea')
one('*Arin waits at sea for the keeper.', 'Arin waits at sea', 'Arin waits at sea')
none('Arin waits at sea_ for the keeper.', 'Arin waits at sea for the keeper')
none('Pay 2*3 and 4*5 today.', 'Pay 23 and 45 today')
none('A **bold* claim stands.', 'A bold claim stands')
// Code spans and backslash escapes: their * / _ are literal and never pair (attempt-4 repros).
none('The `*never*` flag stays disabled all night.', 'The `never` flag stays disabled all night')
one('The `*never*` flag stays disabled all night.', 'The `*never*` flag stays disabled', 'The `*never*` flag stays disabled')
none('Write \\*bright\\* markers exactly today', 'Write \\bright\\ markers exactly today')
none('Write \\*bright\\* markers exactly today', 'Write bright markers exactly today')
one('Write \\*bright\\* markers exactly today', 'Write \\*bright\\* markers', 'Write \\*bright\\* markers')
none('Use ``a_b_c`` and `x_y_` now.', 'Use ``abc`` and')
none('Use ``*a* `` here.', 'Use ``a `` here')
// An escaped closing backtick does not end a code span: the span stays open, so *bright* is real emphasis.
one('The `*bright*\\` beacon burns all night.', 'The `bright\\` beacon burns all night', 'The `*bright*\\` beacon burns all night')
// An unclosed `` run is literal; the single-backtick span after it still protects its marks.
none('Use ``a `b *x*` here.', 'Use ``a `b x` here')
one('Keep `code` but *this* folds.', 'Keep `code` but this folds', 'Keep `code` but *this* folds')
one('An escaped \\\\*real* pair still folds.', 'escaped \\\\real pair', 'escaped \\\\*real* pair')
// A closing run adjoining the next word still closes the pair.
one('*Bright*star shines all night.', 'Brightstar shines all night', '*Bright*star shines all night')
one('__Old__ keeper waits at dawn.', 'Old keeper waits', '__Old__ keeper waits')
// Marks taken in do not count toward the 8-char minimum (findQuotePassage counts the folded submitted quote): '**Arin**' is 4.
assert.deepEqual(quoteMatches('**Arin** waits at sea.', 'Arin'), ['**Arin**'])
assert.equal(foldQuoteText('Arin').str.replace(/\s/g, '').length, 4)
// Dash runs: consecutive dashes are one run; two runs apart stay two tokens.
none('2 - -3 equals five today.', '2-3 equals five today')
one('2 - -3 equals five today.', '2 - - 3 equals five', '2 - -3 equals five')
one('2 - -3 equals five today.', '2- -3 equals five', '2 - -3 equals five')
one('Arin -- the keeper waits.', 'Arin—the keeper', 'Arin -- the keeper')
assert.equal(foldQuoteText('a - - b').str, 'a- -b')
assert.equal(foldQuoteText('a -- b').str, 'a-b')
// Emphasis next to punctuation still folds: (*x*), *"y"*, **bold**,
one('A (*small*) boat, **never**, sails.', 'A (small) boat, never, sails', 'A (*small*) boat, **never**, sails')
one('She said *“go”* twice.', 'said "go" twice', 'said *“go”* twice')
// Astral chars (emoji, 2 UTF-16 units) before, inside and after the hit keep the offsets right.
one('😀 Arin waits by the harbour.', 'Arin waits by the harbour', 'Arin waits by the harbour')
one('😀😀 Arin waits by the harbour.', 'Arin waits by the harbour', 'Arin waits by the harbour')
one('😀 “Arin” 🌊 waits — 𝔸 by the harbour 😀.', '"Arin" 🌊 waits - 𝔸 by', '“Arin” 🌊 waits — 𝔸 by')
one('Arin waits 😀\nby the harbour 🌊', 'waits 😀 by the harbour 🌊', 'waits 😀\nby the harbour 🌊')
none('😀 Arin waits.', '😁 Arin waits')
// Line breaks and whitespace runs, NBSP.
one('Arin waits on the\nharbour wall  until\r\ndawn.', 'waits on the harbour wall until dawn', 'waits on the\nharbour wall  until\r\ndawn')
one('Arin waits by the wall.', 'Arin waits by', 'Arin waits by')
// Canonical equivalence: decomposed source, composed quote, and back; the offset map keeps the raw (decomposed) characters.
one('Café Noir opens at dawn.', 'Café Noir opens', 'Café Noir opens')
one('Café Noir opens at dawn.', 'Café Noir opens', 'Café Noir opens')
// Hangul: composed source vs decomposed (jamo) quote and back; NFD per char needs no neighbour, raw chars are stored.
one('한국 항구에서 기다린다.', '한국 항구에서 기다린다', '한국 항구에서 기다린다')
one('한국 항구에서 기다린다.', '한국 항구에서 기다린다', '한국 항구에서 기다린다')
none('한국 항구에서 기다린다.', '한국 항구에서 기다렸다')
// Base char without its accent is not a match: "Cafe" must not cite "Café".
none('Café Noir opens at dawn.'.normalize('NFC'), 'Cafe Noir opens')
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
// A retried quote (first letter lowered, added full stop dropped) must start / end on a word boundary in the source.
assert.deepEqual(quoteMatches('the compass near the edge', 'pass near the edge', undefined, { start: true }), [])
assert.deepEqual(quoteMatches('let goats roam', 'let go', undefined, { end: true }), [])
assert.deepEqual(quoteMatches('😀pass near 𝔸', 'pass near', undefined, { start: true, end: true }), ['pass near'])
assert.deepEqual(quoteMatches('𝔸pass near', 'pass near', undefined, { start: true }), [], 'a letter outside the BMP is a word char')
Object.assign(globalThis, { foldQuoteText, quoteMatches }) // db.ts reaches them as Nitro auto-imports
const { findQuotePassage } = await import('../server/utils/db.ts')
const harbor = [{ text: 'They dropped the compass near the edge of the harbor and let goats roam.' }]
assert.equal(findQuotePassage(harbor, 'Pass near the edge.'), undefined, 'a lowered first letter must not land inside "compass"')
assert.equal(findQuotePassage(harbor, 'Pass near the edge'), undefined)
assert.equal(findQuotePassage(harbor, 'The harbor and let go.'), undefined, 'a dropped full stop must not end inside "goats"')
assert.equal(findQuotePassage(harbor, 'Compass near the edge.')?.quote, 'compass near the edge')
assert.equal(findQuotePassage([{ text: 'He said nobody would let go, and left.' }], 'Nobody would let go.')?.quote, 'nobody would let go')
assert.equal(findQuotePassage([{ text: 'He said *nobody* would let go.' }], 'Nobody would let go.')?.quote, '*nobody* would let go.')
console.log('ok  quote folding: quotes, dashes, ellipsis, Markdown (emphasis only; code spans and escapes literal), line breaks, NFD, Hangul, emoji offsets, absent')
