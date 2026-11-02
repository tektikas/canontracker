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

// Parses a From/To pair. A day-only From with no To covers that whole day, so it overlaps anything on that day.
export function parseStoryRange(from?: string | null, to?: string | null) {
  const f = parseStoryTime(from, 'from')
  let t = parseStoryTime(to, 'to')
  const bad = (!!from?.trim() && f == null) || (!!to?.trim() && t == null)
  if (t == null && !to?.trim() && f != null && !from!.includes(':')) t = f + DAY - 1
  return { from: f, to: t, bad }
}

export function formatStoryTime(t: number, dayOnly = false) {
  const day = Math.floor(t / DAY) + 1
  if (dayOnly) return `D${day}`
  const mins = ((t % DAY) + DAY) % DAY
  return `D${day} ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

export function timeLabel(from: number | null, to: number | null, precision?: string | null) {
  if (from == null && to == null) return null
  const mod = (t: number) => ((t % DAY) + DAY) % DAY
  const wholeFrom = from != null && mod(from) === 0
  const wholeTo = to != null && mod(to) === DAY - 1
  // Day-only labels only when every edge present is a whole-day edge (a real 00:00 – 23:59 range reads the same way).
  const whole = (from == null || wholeFrom) && (to == null || wholeTo)
  const fmt = (t: number) => formatStoryTime(t, whole)
  const range = from != null && to != null
    ? (whole && Math.floor(from / DAY) === Math.floor(to / DAY) ? fmt(from) : `${fmt(from)} – ${fmt(to)}`)
    : from != null ? fmt(from) : `until ${fmt(to!)}`
  return precision === 'approximate' ? `~ ${range}` : range
}
