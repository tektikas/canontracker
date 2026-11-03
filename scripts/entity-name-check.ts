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
