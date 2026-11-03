// Self-check for the recognition hints sent to Muse Voice Transcribe (transcriptionHints, shared/utils/entities.ts; used by
// transcriptionKeywords in server/utils/audio.ts). Run: node scripts/voice-keywords-check.ts
// Muse answers 400 for any keyword over 30 characters, so a long page title must never be sent; its short names still are.
// Over the 100-keyword cap, the most-cited pages win (canon fact count, ties by title), not the alphabetically first.
import assert from 'node:assert/strict'
import { KEYWORD_MAX_CHARS, transcriptionHints } from '../shared/utils/entities.ts'

// Pages as namesOf gives them for the Sherlock canon (title, aliases, analysis name), long ones included: the 5th keyword in
// the live 400 was "a husband and father of two children".
const pages = [
  { title: 'Watson', names: ['Watson', 'Dr. Watson', 'John H. Watson'], facts: 120 },
  { title: 'Sherlock Holmes', names: ['Sherlock Holmes', 'Holmes'], facts: 300 },
  { title: 'Baker Street', names: ['Baker Street', '221B Baker Street'], facts: 12 },
  { title: 'a husband and father of two children', names: ['a husband and father of two children'], facts: 2 }, // 36: dropped
  { title: 'the Fifth Northumberland Fusiliers regiment', names: ['the Fifth Northumberland Fusiliers regiment', 'Fifth Northumberland Fusiliers'], facts: 1 }, // 43 dropped, 30 kept
  { title: 'Mary Morstan', names: ['  Mary   Morstan ', 'Mary Morstan', 'WATSON'], facts: 12 }, // spacing and case duplicates
  { title: 'Ödön', names: ['Ödön Lehel-Szentgyörgyiné Ab'], facts: 0 }, // 28 characters with diacritics: kept
]
const hints = transcriptionHints(pages)
assert.ok(hints.every(h => h.length <= KEYWORD_MAX_CHARS), 'no keyword over 30 characters')
assert.deepEqual(hints, [
  'Sherlock Holmes', 'Holmes', 'Watson', 'Dr. Watson', 'John H. Watson', 'Baker Street', '221B Baker Street', 'Mary Morstan',
  'Fifth Northumberland Fusiliers', 'Ödön Lehel-Szentgyörgyiné Ab',
])
// The count limit holds, counts kept names only, and keeps the most-cited pages: 150 named "Aaa…" with no facts lose to
// 150 cited pages that sort after them by name; ties go by title.
const many = [
  ...Array.from({ length: 150 }, (_, i) => ({ title: `Aaa ${i}`, names: [`Aaa ${i}`], facts: 0 })),
  ...Array.from({ length: 150 }, (_, i) => ({ title: `Zed ${i}`, names: [`Zed ${i}`, `A very long alias for page number ${i}`], facts: 1 + (i % 3) })),
]
const capped = transcriptionHints(many)
assert.equal(capped.length, 100)
assert.ok(capped.every(h => h.startsWith('Zed ')), 'cited pages first')
assert.deepEqual(capped.slice(0, 3), ['Zed 101', 'Zed 104', 'Zed 107'], 'most facts first, ties by title')
assert.deepEqual(transcriptionHints([{ title: 'x', names: ['', '   '], facts: 3 }]), [])

console.log('voice-keywords-check: ok')
