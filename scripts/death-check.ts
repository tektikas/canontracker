// Self-check for "Acts after death" (ACTS_AFTER_DEATH): node scripts/death-check.ts (Node 24 strips the types).
// Who a fact says dies, what counts as acting, and the rule as ruleHits runs it. Exits non-zero on a failure.
import assert from 'node:assert/strict'
import * as detail from '../shared/utils/detail.ts'
import * as storyTime from '../shared/utils/story-time.ts'

// analysis.ts reaches these as Nitro auto-imports.
Object.assign(globalThis, detail, storyTime, { normEntity: (s?: string | null) => s?.trim().toLowerCase() || null })
const { ruleHits } = await import('../server/utils/analysis.ts')
const { diesIn, actsAlive } = detail

// Who dies: the subject of a death predicate or a dead state, the object of a killing.
const f0 = (subject: string, predicate: string, object: string | null = null, value: string | null = null) => ({ subject, predicate, object, value })
assert.equal(diesIn(f0('Varek', 'dies')), 'Varek')
assert.equal(diesIn(f0('Aldous', 'died_ringing', 'Ashbell')), 'Aldous', 'the Ashbell recording')
assert.equal(diesIn(f0('Arthur Morstan', 'dies_at', 'Pondicherry Lodge')), 'Arthur Morstan', 'the Sherlock recording')
assert.equal(diesIn(f0('Stangerson', 'alive_is', null, 'dead')), 'Stangerson')
assert.equal(diesIn(f0('Teodric', 'status_is', null, 'Dead.')), 'Teodric')
assert.equal(diesIn(f0('Small', 'killed', 'convict-guard')), 'convict-guard', 'a killing: the object dies')
assert.equal(diesIn(f0('Varek', 'killed_by', 'Isolde')), 'Varek', 'killed_by: the subject dies')
assert.equal(diesIn(f0('Tin Woodman', 'kills')), null, 'a killing with no victim')
for (const p of ['decides_to_kill', 'refuses_to_kill', 'demands_killing_of', 'deadline_is', 'mother_status_is']) assert.equal(diesIn(f0('X', p, 'Y', 'dead')), null, p)
assert.equal(diesIn(f0('Jack Pumpkinhead', 'alive_is', null, 'alive')), null)
assert.equal(diesIn(f0('Tiktok', 'alive_is', null, 'not alive')), null, 'not alive is not a death')

// Acting: doing something; not buried, mourned, mentioned, a rule, an identity or a detail.
assert.equal(actsAlive(f0('Varek', 'greets', 'the party')), true)
assert.equal(actsAlive(f0('Varek', 'located_at', 'Saltmere')), true)
assert.equal(actsAlive(f0('Teodric', 'status_is', null, 'alive')), true, 'alive again')
for (const p of ['buried_at', 'mourned_by', 'remembered_by', 'mentioned_in', 'named_after', 'ghost_haunts', 'is', 'eye_colour_is', 'dies'])
  assert.equal(actsAlive(f0('Varek', p, 'Y', 'grey')), false, p)
assert.equal(actsAlive({ ...f0('Varek', 'rule', null), kind: 'rule' }), false, 'a world rule')

// The rule as the scan runs it.
let n = 0
const fact = (subject: string, predicate: string, object: string | null, from: string | null, value: string | null = null) => {
  const r = storyTime.parseStoryRange(from, null)
  return { id: `f${++n}`, kind: 'event', subject, predicate, object, value, statement: `${subject} ${predicate} ${object ?? value ?? ''}`.trim(), t_from: r.from, t_to: r.to,
    time_label: storyTime.timeLabel(r.from, r.to, from ? 'exact' : null, r.day), precision: from ? 'exact' : null } as never
}
const rules = (a: never, b: never) => ruleHits(a, b, []).map(h => h.rule)
const dies = fact('X', 'dies', null, 'D3')
assert.deepEqual(rules(dies, fact('X', 'greets', 'Y', 'D5')), ['ACTS_AFTER_DEATH'], 'X dies D3, X greets Y D5')
assert.deepEqual(rules(fact('X', 'greets', 'Y', 'D5'), dies), ['ACTS_AFTER_DEATH'], 'either order')
assert.deepEqual(rules(dies, fact('X', 'greets', 'Y', 'D2')), [], 'X greets Y D2: before the death')
assert.deepEqual(rules(dies, fact('X', 'greets', 'Y', 'D3 18:00')), [], 'the same day: a day-only death is some time that day')
assert.deepEqual(rules(dies, fact('X', 'greets', 'Y', 'D3')), [], 'the same day, day-only')
assert.deepEqual(rules(fact('X', 'dies', null, 'D3 10:00'), fact('X', 'greets', 'Y', 'D3 18:00')), ['ACTS_AFTER_DEATH'], 'a timed death, later that day')
assert.deepEqual(rules(dies, fact('X', 'greets', 'Y', null)), [], 'no time on the act')
assert.deepEqual(rules(fact('X', 'dies', null, null), fact('X', 'greets', 'Y', 'D5')), [], 'no time on the death')
assert.deepEqual(rules(dies, fact('Y', 'greets', 'X', 'D5')), [], 'only the dead person as subject acts')
assert.deepEqual(rules(dies, fact('X', 'buried_at', 'Kettlehold', 'D5')), [], 'a burial is not an act')
assert.deepEqual(rules(fact('Isolde', 'killed', 'X', 'D3'), fact('x ', 'greets', 'Y', 'D5')), ['ACTS_AFTER_DEATH'], 'killed by someone else; names compared as analysis compares them')
assert.deepEqual(rules(fact('Teodric', 'status_is', null, 'D700', 'dead'), fact('Teodric', 'status_is', null, 'D2000', 'alive')), ['ACTS_AFTER_DEATH'], 'dead, then alive')
const hit = ruleHits(dies, fact('X', 'greets', 'Y', 'D5'), [])[0]!
assert.equal(hit.rationale, 'X dies at D3 ("X dies"), but acts at D5: "X greets Y".')
assert.equal((hit.a as { predicate: string }).predicate, 'dies', 'the death is the left fact')
console.log('death-check: ok')
