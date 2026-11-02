// Self-check for the Add fact guesses: node scripts/predicate-check.ts (Node 24 strips the types). Exits non-zero on a failure.
import assert from 'node:assert/strict'
import { suggestParts, timesIn } from '../app/utils/predicate.ts'

const LEYA = { name: 'Leya', kind: 'character' }
const HARBOR = { name: 'Harbor', kind: 'location' }
const none = { relation: '', object: '' }
const at = { relation: 'is at', object: 'Harbor' }
const check = (text: string, known: { name: string, kind?: string }[], want: Record<string, string>) =>
  assert.deepEqual(suggestParts(text, known), { subject: '', relation: '', object: '', time_from: '', time_to: '', ...want }, text)

// Lead review c34r: motion is not presence.
check('At 08:00 on Day 1, Leya walks down to the Harbor to meet Arin.', [LEYA, HARBOR], { subject: 'Leya', ...none, time_from: 'D1 08:00' })
// The location is the place, the character the subject, whatever comes first.
check('At the Harbor, Leya waits at 08:00 on Day 1.', [HARBOR, LEYA], { subject: 'Leya', ...at, time_from: 'D1 08:00' })
check('At the Harbor, Leya waits from 08:00 on Day 1 until 09:00 on Day 2.', [HARBOR, LEYA], { subject: 'Leya', ...at, time_from: 'D1 08:00', time_to: 'D2 09:00' })
// Each clock keeps its own day.
assert.deepEqual(timesIn('Leya is at Harbor from 08:00 on Day 1 until 09:00 on Day 2.'), { from: 'D1 08:00', to: 'D2 09:00' })
assert.deepEqual(timesIn('Day 1 08:00 until Day 2, 09:00'), { from: 'D1 08:00', to: 'D2 09:00' })
assert.deepEqual(timesIn('From 20:00 to 21:00 on Day 1.'), { from: 'D1 20:00', to: 'D1 21:00' })
// A clock without its own day and two days in the sentence: no guess.
assert.deepEqual(timesIn('On Day 1 at dawn she sails; she is back by 09:00, before Day 2.'), { from: '', to: '' })
assert.deepEqual(timesIn('08:00 on Day 1, and later 09:00, before Day 2.').to, '')

// Presence wording suggests "is at"; movement never does.
for (const v of ['is at', 'is in', 'waits at', 'stands at', 'sits in', 'stays at', 'hides in', 'works at', 'arrives at', 'is still at'])
  check(`Leya ${v} the Harbor at 08:00 on Day 1.`, [LEYA, HARBOR], { subject: 'Leya', ...at, time_from: 'D1 08:00' })
for (const v of ['walks to', 'goes to', 'heads towards', 'runs to', 'sails to', 'leaves', 'is walking to', 'arrives at the gate and leaves'])
  check(`Leya ${v} the Harbor at 08:00 on Day 1.`, [LEYA, HARBOR], { subject: 'Leya', ...none, time_from: 'D1 08:00' })
// No time or no known place: no "is at".
check('Leya waits at the Harbor.', [LEYA, HARBOR], { subject: 'Leya' })
check('Leya waits at the Harbor at 08:00 on Day 1.', [LEYA], { subject: 'Leya', time_from: 'D1 08:00' })

// Empty project: the first capitalised name is suggested, not a sentence opener, "Day" or a place after "the".
check('At 08:00 on Day 1, Leya walks down to the Harbor.', [], { subject: 'Leya', time_from: 'D1 08:00' })
check('At the Harbor, Leya waits.', [], { subject: 'Leya' })
check('At Saltmarsh, Leya waits.', [], { subject: 'Leya' })
check('The Glassworks hires Old Tom.', [], { subject: 'Glassworks' })
check("Leya's lantern is lit.", [], { subject: 'Leya' })
// A known page that isn't a character, faction or place is not guessed as who.
check('The Chord Stone is kept in the Vault.', [{ name: 'Chord Stone', kind: 'item' }], {})

console.log('predicate-check: ok')
