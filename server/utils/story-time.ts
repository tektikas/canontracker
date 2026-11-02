// Story time is "D<day> HH:MM" or day-only "D<day>", stored as minutes since Day 1 00:00. The day may be 0 or negative
// (D0 = the day before D1, D-3650 = ten years before), which stores as negative minutes.
const RE = /^D(-?\d+)(?:\s+(\d{1,2}):(\d{2}))?$/
const DAY = 1440

// A day-only value is the whole day: From reads as 00:00, To as 23:59.
export function parseStoryTime(label?: string | null, edge: 'from' | 'to' = 'from') {
  const m = label?.trim().match(RE)
  if (!m) return null
  const day = Number(m[1])
  if (!Number.isSafeInteger(day) || Math.abs(day) > 1e6) return null
  if (m[2] == null) return (day - 1) * DAY + (edge === 'to' ? DAY - 1 : 0)
  if (Number(m[2]) > 23 || Number(m[3]) > 59) return null
  return (day - 1) * DAY + Number(m[2]) * 60 + Number(m[3])
}

// Parses a From/To pair. A day-only From with no To covers that whole day. `day` says which edges were typed without a
// clock: the label and the conflict rules read it instead of guessing from 00:00 / 23:59 (a real timed 00:00 - 23:59 stays timed).
export function parseStoryRange(from?: string | null, to?: string | null) {
  const f = parseStoryTime(from, 'from')
  let t = parseStoryTime(to, 'to')
  const bad = (!!from?.trim() && f == null) || (!!to?.trim() && t == null)
  const dayFrom = f != null && !from!.includes(':')
  let dayTo = t != null && !to!.includes(':')
  if (t == null && !to?.trim() && dayFrom) { t = f! + DAY - 1; dayTo = true }
  return { from: f, to: t, bad, day: { from: dayFrom, to: dayTo } }
}

// A fact is day-only when its stored label has a bare "D<day>" edge. Day-only means "some time that day", not "all day".
export const isDayOnlyLabel = (label?: string | null) => !!label && /D-?\d+(?!\d| \d)/.test(label)

export function formatStoryTime(t: number, dayOnly = false) {
  const day = Math.floor(t / DAY) + 1
  if (dayOnly) return `D${day}`
  const mins = ((t % DAY) + DAY) % DAY
  return `D${day} ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

export function timeLabel(from: number | null, to: number | null, precision?: string | null, day = { from: false, to: false }) {
  if (from == null && to == null) return null
  const fmt = (t: number, d: boolean) => formatStoryTime(t, d)
  const range = from != null && to != null
    ? (day.from && day.to && Math.floor(from / DAY) === Math.floor(to / DAY) ? fmt(from, true) : `${fmt(from, day.from)} – ${fmt(to, day.to)}`)
    : from != null ? fmt(from, day.from) : `until ${fmt(to!, day.to)}`
  return precision === 'approximate' ? `~ ${range}` : range
}
