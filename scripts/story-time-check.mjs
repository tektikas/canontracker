// Self-check for story time parsing/formatting. Run: node scripts/story-time-check.mjs
import assert from 'node:assert/strict'
import { parseStoryTime as p, parseStoryRange as r, formatStoryTime as f, timeLabel as l } from '../server/utils/story-time.ts'

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
assert.deepEqual(r('D-5', ''), { from: -6 * 1440, to: -5 * 1440 - 1, bad: false })
assert.deepEqual(r('D-5 10:00', ''), { from: -6 * 1440 + 600, to: null, bad: false })
assert.equal(r('D2', 'D4').to, 4 * 1440 - 1)
assert.equal(r('D1 09:00', 'nope').bad, true)
assert.equal(r('', '').bad, false)
// labels
assert.equal(l(r('D-3650', '').from, r('D-3650', '').to), 'D-3650')
assert.equal(l(...Object.values(r('D-3650', 'D-3640')).slice(0, 2)), 'D-3650 – D-3640')
assert.equal(l(p('D1 09:00'), null), 'D1 09:00')
assert.equal(l(p('D1 09:00'), p('D1 10:30', 'to'), 'approximate'), '~ D1 09:00 – D1 10:30')
assert.equal(l(null, p('D3 08:00')), 'until D3 08:00')
console.log('story-time ok')
