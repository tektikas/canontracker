// Self-check for the stemmer canon Ask matches with (stem, server/utils/qa.ts; /api/qa, conversations and MCP sb_ask all use
// askCanon). Run: node scripts/stem-check.ts
// Word forms must meet; words that only look alike must not (a false match answers "News?" from "The new gate opens.").
import assert from 'node:assert/strict'
import { stem } from '../server/utils/qa.ts'

const meet = [
  ['wound', 'wounded', 'wounds', 'wounding'], ['marry', 'married', 'marries', 'marrying'], ['live', 'lives', 'lived', 'living'],
  ['use', 'uses', 'used', 'using'], ['study', 'studies', 'studied', 'studying'], ['stop', 'stops', 'stopped', 'stopping'],
  ['shoulder', 'shoulders'], ['glass', 'glasses'], ['box', 'boxes'], ['kill', 'killed'], ['hope', 'hoped'], ['need', 'needed'],
]
for (const forms of meet) assert.deepEqual(new Set(forms.map(w => stem(w))).size, 1, `${forms.join('/')} meet: ${forms.map(w => stem(w)).join('/')}`)
const apart = [['news', 'new'], ['james', 'jam'], ['bus', 'bu'], ['this', 'thi'], ['series', 'sery'], ['species', 'specy'], ['species', 'specie'],
  ['holmes', 'holm'], ['speed', 'spe'], ['thing', 'th'], ['status', 'statu'], ['basis', 'basi'], ['need', 'ne']]
for (const [a, b] of apart) assert.notEqual(stem(a!), stem(b!), `${a} and ${b} must not meet`)
// Short words and numbers stay; the capitalised words of the project's names are never stemmed.
for (const w of ['day', 'was', 'red', 'king', '1887', '221b']) assert.equal(stem(w), w)
const names = new Set(['holmes', 'james', 'rivers'])
for (const w of names) assert.equal(stem(w, names), w)
assert.equal(stem('rivers'), 'river')

console.log('stem-check: ok')
