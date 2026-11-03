// Self-check for the recognition hints sent to Muse Voice Transcribe (transcriptionHints, shared/utils/entities.ts; used by
// transcriptionKeywords in server/utils/audio.ts). Run: node scripts/voice-keywords-check.ts
// Muse answers 400 for any keyword over 30 characters, so a long page title must never be sent; its short names still are.
import assert from 'node:assert/strict'
import { KEYWORD_MAX_CHARS, transcriptionHints } from '../shared/utils/entities.ts'

// Names as namesOf gives them for the Sherlock canon (title, aliases, analysis name per page), long ones included: the 5th
// keyword in the live 400 was "a husband and father of two children".
const names = [
  'Watson', 'Dr. Watson', 'John H. Watson',
  'Sherlock Holmes', 'Holmes',
  'Baker Street', '221B Baker Street',
  'a husband and father of two children', // 36: dropped
  'the Fifth Northumberland Fusiliers regiment', 'Fifth Northumberland Fusiliers', // 43: dropped; 30: kept
  'WATSON', '  Mary   Morstan ', 'Mary Morstan', // case and spacing duplicates
  'Ödön Lehel-Szentgyörgyiné Ab', // 28 characters with diacritics: kept
]
const hints = transcriptionHints(names)
assert.ok(hints.every(h => h.length <= KEYWORD_MAX_CHARS), 'no keyword over 30 characters')
assert.deepEqual(hints, [
  'Watson', 'Dr. Watson', 'John H. Watson', 'Sherlock Holmes', 'Holmes', 'Baker Street', '221B Baker Street',
  'Fifth Northumberland Fusiliers', 'Mary Morstan', 'Ödön Lehel-Szentgyörgyiné Ab',
])
// The count limit holds and counts kept names only.
const many = Array.from({ length: 300 }, (_, i) => (i % 2 ? `A very long page title number ${i}` : `Name ${i}`))
const capped = transcriptionHints(many)
assert.equal(capped.length, 100)
assert.ok(capped.every(h => h.startsWith('Name ')))
assert.deepEqual(transcriptionHints(['', '   ']), [])

console.log('voice-keywords-check: ok')
