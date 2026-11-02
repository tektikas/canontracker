// Self-check for story time parsing/formatting. Run: node scripts/story-time-check.mjs
import assert from 'node:assert/strict'
import { isDayOnlyLabel as dayOnly, parseStoryTime as p, parseStoryRange as r, formatStoryTime as f, timeLabel as l } from '../server/utils/story-time.ts'

assert.equal(p('D1 00:00'), 0)
assert.equal(p('D2 14:30'), 1440 + 870)
assert.equal(p('D0 00:00'), -1440)
assert.equal(p('D0 23:59'), -1)
assert.equal(p('D-3650 09:00'), -3651 * 1440 + 540)
assert.equal(p('D-3650'), -3651 * 1440)
assert.equal(p('D-3650', 'to'), -3650 * 1440 - 1)
for (const bad of ['', 'D', 'D1 25:00', 'D1 09:60', 'D--1', 'day 1', 'D1 9', 'D1e3', null]) assert.equal(p(bad), null, String(bad))
for (const t of [0, 1, 1439, 1440, -1, -1440, -1441, -3651 * 1440 + 540]) assert.equal(p(f(t)), t, `roundtrip ${t}`)
// ordering: negative days sort before D1
assert.ok(p('D-3650 09:00') < p('D0 00:00') && p('D0 00:00') < p('D1 00:00'))
// whole-day: day-only From alone covers the day; a range of day-only values covers both days fully
assert.deepEqual(r('D-5', ''), { from: -6 * 1440, to: -5 * 1440 - 1, bad: false, day: { from: true, to: true } })
assert.deepEqual(r('D-5 10:00', ''), { from: -6 * 1440 + 600, to: null, bad: false, day: { from: false, to: false } })
assert.equal(r('D2', 'D4').to, 4 * 1440 - 1)
assert.equal(r('D1 09:00', 'nope').bad, true)
assert.equal(r('', '').bad, false)
// labels
const lab = (a, b, pr) => { const x = r(a, b); return l(x.from, x.to, pr, x.day) }
assert.equal(lab('D-3650', ''), 'D-3650')
assert.equal(lab('D-3650', 'D-3640'), 'D-3650 – D-3640')
// a real timed 00:00 - 23:59 range stays timed (not day-only)
assert.equal(lab('D1 00:00', 'D1 23:59'), 'D1 00:00 – D1 23:59')
assert.equal(dayOnly(lab('D1 00:00', 'D1 23:59')), false)
for (const x of ['D-3650', 'D12', 'D1 – D3', 'D1 – D3 08:00', 'until D3', '~ D5']) assert.equal(dayOnly(x), true, x)
for (const x of ['D1 09:00', 'D12 09:00', 'D-5 10:00 – D-5 11:00', 'until D3 08:00', null]) assert.equal(dayOnly(x), false, String(x))
assert.equal(l(p('D1 09:00'), null), 'D1 09:00')
assert.equal(l(p('D1 09:00'), p('D1 10:30', 'to'), 'approximate'), '~ D1 09:00 – D1 10:30')
assert.equal(l(null, p('D3 08:00')), 'until D3 08:00')

console.log('story-time ok')

// Edge-only day-only check (RELATIONSHIP_AFTER_END rationale): a timed end must not read as day-only.
assert.equal(dayOnly('D-3650 08:00', 'to'), false)
assert.equal(dayOnly('D-3650 08:00 – D-3649', 'to'), true)
assert.equal(dayOnly('D-3650 08:00 – D-3649', 'from'), false)
assert.equal(dayOnly('D-3650 – D-3649 08:00', 'to'), false)
assert.equal(dayOnly('~ D-3650', 'to'), true)
