// Self-check for "Same detail, two answers" (ATTRIBUTE_MISMATCH): node scripts/detail-check.ts (Node 24 strips the types).
// Pure cases on the value comparison, time ranges, merged names, and the rule as ruleHits runs it. Exits non-zero on a failure.
import assert from 'node:assert/strict'
import * as detail from '../shared/utils/detail.ts'
import * as storyTime from '../shared/utils/story-time.ts'

const { sameDetailValue: same, holdTogether, asDetail, isDetailPredicate } = detail
// analysis.ts reaches these as Nitro auto-imports.
Object.assign(globalThis, detail, storyTime, { normEntity: (s?: string | null) => s?.trim().toLowerCase() || null })
const { ruleHits } = await import('../server/utils/analysis.ts')

// Values: one answer that only adds words agrees; anything else disagrees.
assert.equal(same('shoulder', 'leg'), false, 'shoulder vs leg')
assert.equal(same('shoulder', 'left shoulder'), true, 'left shoulder refines shoulder')
assert.equal(same('the shoulder', 'his left shoulder'), true, 'articles and possessives are ignored')
assert.equal(same('Shoulder.', 'shoulder'), true, 'case and punctuation are ignored')
assert.equal(same('left shoulder', 'right shoulder'), false, 'left vs right')
assert.equal(same('John', 'James'), false, 'John vs James')
assert.equal(same('John H.', 'John'), true, 'an initial refines a name')
assert.equal(same('Mrs. Hudson', 'Mrs. Turner'), false, 'two landladies')
assert.equal(same('Mrs. Hudson', 'Hudson'), true, 'a title refines a name')
assert.equal(same('dead', 'not dead'), false, 'a negation on one side never agrees')
assert.equal(same('dead', 'alive'), false, 'dead vs alive')
assert.equal(same('', 'leg'), true, 'an empty answer says nothing (the rule needs both values anyway)')

// Time: no time = always; points and ranges overlap or not.
const t = (from: string | null, to: string | null = null) => storyTime.parseStoryRange(from, to)
const at = (from: string | null, to: string | null = null) => ({ t_from: t(from, to).from, t_to: t(from, to).to })
assert.equal(holdTogether(at(null), at(null)), true, 'two timeless answers hold together')
assert.equal(holdTogether(at(null), at('D3 10:00')), true, 'a timeless answer holds always')
assert.equal(holdTogether(at('D1 10:00'), at('D5 10:00')), false, 'two different points')
assert.equal(holdTogether(at('D1 10:00', 'D3 10:00'), at('D3 10:00', 'D9 10:00')), true, 'ranges touching at one minute')
assert.equal(holdTogether(at('D1 10:00', 'D3 09:59'), at('D3 10:00', 'D9 10:00')), false, 'one range ends before the next starts')
assert.equal(holdTogether(at('D2'), at('D2 14:00')), true, 'a day-only answer covers its whole day')
assert.equal(holdTogether(at('D2'), at('D3 14:00')), false, 'and only that day')

// The shape: "<detail>_is" with the answer in value. An answer typed in the object box moves to value.
assert.equal(isDetailPredicate('wound_location_is'), true)
for (const p of ['is', 'is_at', 'located_at', 'has_daughter', 'This_is', 'wound location is']) assert.equal(isDetailPredicate(p), false, p)
assert.deepEqual(asDetail({ predicate: 'wound_location_is', object: 'leg', value: null }), { predicate: 'wound_location_is', object: null, value: 'leg' })
assert.deepEqual(asDetail({ predicate: 'owns', object: 'a bull pup', value: null }), { predicate: 'owns', object: 'a bull pup', value: null })

// The rule as the scan runs it.
let n = 0
const fact = (subject: string, predicate: string, value: string | null, from: string | null = null, to: string | null = null, object: string | null = null) => {
  const r = t(from, to)
  return { id: `f${++n}`, kind: 'character', subject, predicate, object, value, statement: `${subject} ${predicate} ${value}`, t_from: r.from, t_to: r.to,
    time_label: storyTime.timeLabel(r.from, r.to, from ? 'exact' : null, r.day), precision: from ? 'exact' : null } as never
}
const rules = (a: never, b: never) => ruleHits(a, b, []).map(h => h.rule)
const shoulder = fact('Watson', 'wound_location_is', 'shoulder')
const leg = fact('Watson', 'wound_location_is', 'leg')
assert.deepEqual(rules(shoulder, leg), ['ATTRIBUTE_MISMATCH'], 'the Jezail bullet: shoulder vs leg')
const hit = ruleHits(shoulder, leg, [])[0]!
assert.equal(hit.rationale, 'Watson\'s wound location is "shoulder" in one source and "leg" in the other; it can only have one answer.')
assert.equal(hit.confidence, 0.85)
assert.deepEqual(rules(shoulder, fact('Watson', 'wound_location_is', 'left shoulder')), [], 'a more precise answer is not a second answer')
assert.deepEqual(rules(shoulder, fact('watson ', 'wound_location_is', 'leg')), ['ATTRIBUTE_MISMATCH'], 'subject compared as analysis compares names')
assert.deepEqual(rules(shoulder, fact('Holmes', 'wound_location_is', 'leg')), [], 'another subject')
assert.deepEqual(rules(shoulder, fact('Watson', 'scar_location_is', 'leg')), [], 'another detail')
assert.deepEqual(rules(fact('Watson', 'wounded_in', 'shoulder'), fact('Watson', 'wounded_in', 'leg')), [], 'a free-form predicate is multi-valued: never compared')
assert.deepEqual(rules(shoulder, fact('Watson', 'wound_location_is', null, null, null, 'leg')), [], 'an answer in object is not read (asDetail moves it to value before storing)')
assert.deepEqual(rules(fact('Mara', 'hair_colour_is', 'black', 'D1 08:00'), fact('Mara', 'hair_colour_is', 'grey', 'D40 08:00')), [], 'values at different times')
assert.deepEqual(rules(fact('Mara', 'hair_colour_is', 'black', 'D1 08:00', 'D20 08:00'), fact('Mara', 'hair_colour_is', 'grey', 'D10 08:00')), ['ATTRIBUTE_MISMATCH'], 'a value inside another\'s range')
const timed = ruleHits(fact('Mara', 'hair_colour_is', 'black', 'D1 08:00', 'D20 08:00'), fact('Mara', 'hair_colour_is', 'grey', 'D10 08:00'), [])[0]!
assert.ok(timed.rationale.endsWith('it can only have one answer at a time.') && timed.rationale.includes('(D10 08:00)'), timed.rationale)
assert.deepEqual(rules(fact('Mara', 'hair_colour_is', 'black'), fact('Mara', 'hair_colour_is', 'grey', 'D40 08:00')), ['ATTRIBUTE_MISMATCH'], 'a timeless value holds always')
// Merges re-point subjects to the kept name (server/utils/entities.ts); until then two names are two subjects.
const wife = fact("Watson's wife", 'mother_status_is', 'alive')
const mary = fact('Mary', 'mother_status_is', 'dead')
assert.deepEqual(rules(wife, mary), [], 'before the merge: two subjects')
assert.deepEqual(rules({ ...(wife as object), subject: 'Mary' } as never, mary), ['ATTRIBUTE_MISMATCH'], 'after the merge: one subject, two answers')
// An answer that names no particular value never clashes.
assert.deepEqual(rules(shoulder, fact('Watson', 'wound_location_is', 'one of my limbs')), [], 'one of my limbs')
assert.deepEqual(rules(fact('Watson', 'spouse_is', 'unnamed wife'), fact('Watson', 'spouse_is', 'Mary Morstan')), [], 'an unnamed wife')
assert.deepEqual(rules(fact('Watson', 'spouse_is', 'Unknown'), fact('Watson', 'spouse_is', 'Mary Morstan')), [], 'unknown')
assert.deepEqual(rules(fact('Watson', 'spouse_is', 'Someday Smith'), fact('Watson', 'spouse_is', 'Mary Morstan')), ['ATTRIBUTE_MISMATCH'], 'only whole words count as vague')
// Ages change with time: compared only when both say when.
assert.deepEqual(rules(fact('Mary', 'age_is', 'seventeen'), fact('Mary', 'age_is', 'twenty-seven')), [], 'two untimed ages')
assert.deepEqual(rules(fact('Mary', 'age_is', 'seventeen', 'D1'), fact('Mary', 'age_is', 'twenty-seven', 'D1 10:00')), ['ATTRIBUTE_MISMATCH'], 'two ages on the same day')
assert.deepEqual(rules(fact('Mary', 'age_at_marriage_is', '20'), fact('Mary', 'age_at_marriage_is', '25')), [], 'any age detail')
assert.deepEqual(rules(fact('Mary', 'page_count_is', '20'), fact('Mary', 'page_count_is', '25')), ['ATTRIBUTE_MISMATCH'], '"page" is not an age')
// The other rules still ignore detail facts.
assert.deepEqual(rules(fact('Watson', 'located_at', null, 'D1 10:00', null, 'Baker Street'), shoulder), [])

console.log('detail-check: ok')
