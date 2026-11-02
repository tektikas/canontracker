// Self-check for continuity grounding (groundReport in server/utils/continuity.ts). Run: node scripts/continuity-check.ts
// The model's answer and tool calls are shaped as the agent records them; sb_check_facts results as the MCP tool returns them.
import assert from 'node:assert/strict'
import { quoteMatches } from '../server/utils/quote.ts'

Object.assign(globalThis, { quoteMatches, fixedWindow: () => () => 0 }) // continuity.ts reaches them as Nitro auto-imports
const { groundReport } = await import('../server/utils/continuity.ts')

const S1 = 'At 21:30 on Day 2, Captain Rourke walks the market stalls of Saltgate.'
const S2 = 'Ves sleeps in the tower.'
const text = `${S1} ${S2}`
const canon = new Set(['fact_watch', 'fact_tower'])
const hit = (i: number, statement: string) => ({ rule: 'EXACT_TIME_LOCATION_OVERLAP', severity: 'hard', confidence: 1, rationale: 'Same subject, two places, overlapping times.',
  left: { proposed_index: i, statement, time: 'D2 21:30' }, right: { fact_id: 'fact_watch', statement: 'Captain Rourke stands watch at the Bell Gate.', time: 'D2 21:00–22:00' } })
const proposed = [
  { kind: 'event', subject: 'Rourke', predicate: 'located_at', object: 'Saltgate', time_from: 'D2 21:30', statement: 'Rourke is at Saltgate.' },
  // An invented whereabouts the text never states, sharing a canon id with the S2 finding.
  { kind: 'event', subject: 'Rourke', predicate: 'located_at', object: 'Cinder Bridge', time_from: 'D2 21:30', statement: 'Rourke is at the Cinder Bridge.' },
]
const calls = [{ name: 'sb_check_facts', args: { facts: proposed }, assumptions: [], error: null, result: {
  proposed: proposed.map((p, i) => ({ index: i, subject: p.subject, object: p.object, statement: p.statement })),
  would_raise: [hit(0, proposed[0]!.statement), hit(1, proposed[1]!.statement), hit(0, proposed[0]!.statement)],
} }]
const finding = (sentence: string, kind: string, fact_ids: unknown[], severity = 'soft') => ({ sentence, kind, severity, fact_ids, explanation: 'x', fix: null, claim: null })
const r = groundReport(text, { summary: 'ok', findings: [
  finding(S1, 'contradicts', ['fact_watch']),
  finding(S2, 'depends_on', ['fact_watch', 'fact_tower']),
  finding(S2, 'contradicts', ['fact_watch', 'fact_invented']),
  finding(S2, 'new', ['fact_invented']),
  finding(S2, 'new', ['fact_tower']),
  finding(S2, 'contradicts', []),
  finding(S2, 'contradicts', [42]),
  finding('Rourke is at Saltgate at noon.', 'contradicts', ['fact_watch']),
  finding(S2, 'new', []),
] }, calls as never, canon)

assert.deepEqual(r.findings.map(f => [f.sentence, f.kind, f.severity, f.checks]), [
  [S1, 'contradicts', 'hard', [0]], // the rule hit decides it, linked by the sentence
  [S2, 'depends_on', 'info', []], // shares fact_watch with the invented hit, but the hit isn't about this sentence
  [S2, 'new', 'info', []],
])
assert.equal(r.checks.length, 1, 'one grounded rule hit, once (duplicate results collapse)')
assert.equal(r.checks[0]!.left.proposed_index, 0)
assert.deepEqual(r.dropped.map(d => d.reason), [
  'It cites a fact that isn’t canon.',
  'It cites a fact that isn’t canon.',
  'It is marked new but cites canon facts; a new claim cites none.',
  'It cited no accepted canon fact.',
  'It cites a fact that isn’t canon.',
  'These words are not in the checked text.',
  'Rule hit (EXACT_TIME_LOCATION_OVERLAP) left out: the fact the AI checked isn’t tied to a sentence of the text (its subject and place or object must both be named in one).',
])
assert.equal(r.dropped.at(-1)!.sentence, 'Rourke is at the Cinder Bridge.')

// A hit whose fact names the subject but not the place stays out; a failed tool call contributes nothing.
const loose = groundReport(S1, { summary: '', findings: [finding(S1, 'contradicts', ['fact_watch'])] }, [
  { ...calls[0]!, args: { facts: [{ ...proposed[0]!, object: 'Bell Gate' }] }, result: { proposed: [{ index: 0, subject: 'Rourke', object: 'Bell Gate' }], would_raise: [hit(0, 'Rourke is at the Bell Gate.')] } },
  { ...calls[0]!, error: 'BAD_INPUT' },
] as never, canon)
assert.deepEqual([loose.checks.length, loose.findings[0]!.severity, loose.dropped.length], [0, 'soft', 1])
// The summary is rebuilt from kept findings when something was dropped: the AI's own claim never survives alone.
assert.equal(loose.summary, '1 finding: 1 soft.')
assert.equal(groundReport(S1, { summary: 'canon places Rourke elsewhere', findings: [] }, [], canon).summary, 'canon places Rourke elsewhere')
console.log('continuity grounding: all checks passed')
