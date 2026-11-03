// Self-check for nameLike (shared/utils/entities.ts): which names in accepted canon get an automatic wiki page.
// Run: node scripts/entity-name-check.ts
import assert from 'node:assert/strict'
import { nameLike, personRef } from '../shared/utils/entities.ts'

const pages = ['Sherlock Holmes', 'Watson', 'Mrs. Hudson', 'Bell Gate', 'the Cinder Key', 'The Ashbell Pass', 'Saint-Lô', 'Peshawar',
  'Isle of Man', 'Ludwig van Beethoven', 'Leonardo da Vinci', 'England', '221B Baker Street', 'Ömer', 'İstanbul', '北京', 'Berkshires']
const not = ['poisons', 'his finger', 'a hæmoglobin reagent', 'Sherlock Holmes’ test', 'rooms with Watson', 'enteric fever',
  'Watson and Sherlock Holmes sharing rooms', 'meet Sherlock Holmes at noon', 'private hotel in the Strand', 'battle of Maiwand',
  'of Mice', 'the', '', 'Doctor of Medicine of the University of London', 'Watson and Sherlock Holmes', 'Holmes and Watson']
for (const n of pages) assert.equal(nameLike(n), true, `page: ${n}`)
for (const n of not) assert.equal(nameLike(n), false, `no page: ${n}`)
for (const n of ["Watson's wife", 'Madame Charpentier’s son', 'Sherlock Holmes’ test', "Holmes' brother"]) assert.equal(personRef(n), true, `person ref: ${n}`)
for (const n of ['his wife', "Watson's", 'rooms with Watson', "Watson's old army wound", 'Watson']) assert.equal(personRef(n), false, `no person ref: ${n}`)
console.log(`entity-name-check: ${pages.length + not.length + 9} names ok`)
// "Possibly the same" suggestions.
import { sameNameSuggestions } from '../shared/utils/entities.ts'
const p = (id: string, name: string, kind = 'character', names?: string[]) => ({ id, name, kind, names })
const sug = (list: ReturnType<typeof p>[]) => sameNameSuggestions(list).map(s => `${s.from.name} → ${s.into.name}`).sort()
assert.deepEqual(sug([p('a', 'Sherlock Holmes'), p('b', 'Sherlock'), p('c', 'Holmes'), p('d', 'Watson')]), ['Holmes → Sherlock Holmes', 'Sherlock → Sherlock Holmes'])
assert.deepEqual(sug([p('a', 'Mary Morstan'), p('b', 'Mary Sutherland'), p('c', 'Mary')]), [], 'ambiguous short name')
assert.deepEqual(sug([p('a', 'Jonathan Small'), p('b', 'Small'), p('c', 'Small', 'location')]), ['Small → Jonathan Small'], 'same type only')
assert.deepEqual(sug([p('a', 'Captain Morstan'), p('b', 'Morstan')]), [], 'a title alone adds no word')
assert.deepEqual(sug([p('a', 'Mrs. Hudson'), p('b', 'Hudson')]), [], 'titles ignored both ways')
assert.deepEqual(sug([p('a', 'John H. Watson', 'character', ['John H. Watson', 'Watson']), p('b', 'Dr Watson')]), ['Dr Watson → John H. Watson'], 'aliases count as names')
assert.deepEqual(sug([p('a', 'Bell Gate', 'location'), p('b', 'Gate', 'location')]), ['Gate → Bell Gate'])
console.log('same-name suggestions: ok')
