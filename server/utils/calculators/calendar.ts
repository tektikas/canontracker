// Calendar calculators via the Julian Day Number. Dates are "YYYY-MM-DD" (astronomical years: 1 BC = 0, 2 BC = -1).
// No imports, so scripts/calculators-check.ts runs this under plain node.

export type Cal = 'gregorian' | 'julian'
export interface Ymd { y: number, m: number, d: number }
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function toJdn({ y, m, d }: Ymd, cal: Cal) {
  const a = Math.floor((14 - m) / 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  const base = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
  return cal === 'gregorian' ? base - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045 : base - 32083
}

export function fromJdn(j: number, cal: Cal): Ymd {
  let b = 0
  let c: number
  if (cal === 'gregorian') {
    const a = j + 32044
    b = Math.floor((4 * a + 3) / 146097)
    c = a - Math.floor(146097 * b / 4)
  } else c = j + 32082
  const d = Math.floor((4 * c + 3) / 1461)
  const e = c - Math.floor(1461 * d / 4)
  const m = Math.floor((5 * e + 2) / 153)
  return { d: e - Math.floor((153 * m + 2) / 5) + 1, m: m + 3 - 12 * Math.floor(m / 10), y: 100 * b + d - 4800 + Math.floor(m / 10) }
}

export const fmt = ({ y, m, d }: Ymd) => `${y < 0 ? '-' : ''}${String(Math.abs(y)).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export function calOf(v: unknown): Cal {
  if (v == null || v === '') return 'gregorian'
  if (v !== 'gregorian' && v !== 'julian') throw new Error('calendar must be gregorian or julian')
  return v
}

/** Parses "YYYY-MM-DD" and refuses a day the calendar doesn't have (2023-02-29, Gregorian 1900-02-29). */
export function parseDate(v: unknown, cal: Cal, name = 'date'): Ymd {
  const m = typeof v === 'string' ? v.trim().match(/^(-?\d{1,6})-(\d{1,2})-(\d{1,2})$/) : null
  if (!m) throw new Error(`${name} must be YYYY-MM-DD`)
  const date = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
  const back = fromJdn(toJdn(date, cal), cal)
  if (date.m < 1 || date.m > 12 || back.y !== date.y || back.m !== date.m || back.d !== date.d) throw new Error(`${name} ${v} does not exist in the ${cal} calendar`)
  return date
}

export function dayOfWeek(a: { date: unknown, calendar?: unknown }) {
  const cal = calOf(a.calendar)
  const j = toJdn(parseDate(a.date, cal), cal)
  return { result: { weekday: WEEKDAYS[(j + 1) % 7], julian_day_number: j }, assumptions: [`Date read in the proleptic ${cal} calendar.`] }
}

export function convertCalendar(a: { date: unknown, from: unknown }) {
  const from = calOf(a.from)
  const to: Cal = from === 'gregorian' ? 'julian' : 'gregorian'
  const j = toJdn(parseDate(a.date, from), from)
  return {
    result: { [from]: fmt(fromJdn(j, from)), [to]: fmt(fromJdn(j, to)), weekday: WEEKDAYS[(j + 1) % 7] },
    assumptions: ['Proleptic calendars. Countries switched to Gregorian at different times (Catholic states 1582, Britain and colonies Sept 1752, Russia 1918); the year number in old records may also start on 25 March.'],
  }
}

export function ageAtDate(a: { birth_date: unknown, on_date: unknown, calendar?: unknown }) {
  const cal = calOf(a.calendar)
  const b = parseDate(a.birth_date, cal, 'birth_date')
  const o = parseDate(a.on_date, cal, 'on_date')
  const days = toJdn(o, cal) - toJdn(b, cal)
  if (days < 0) throw new Error('on_date is before birth_date')
  let years = o.y - b.y
  let months = o.m - b.m
  let d = o.d - b.d
  if (d < 0) {
    months--
    const prev = o.m === 1 ? { y: o.y - 1, m: 12 } : { y: o.y, m: o.m - 1 }
    d += toJdn({ y: o.y, m: o.m, d: 1 }, cal) - toJdn({ ...prev, d: 1 }, cal) // length of the month before on_date
  }
  if (months < 0) {
    years--
    months += 12
  }
  return { result: { years, months, days: d, total_days: days }, assumptions: [`Both dates in the ${cal} calendar.`] }
}

const date = { type: 'string', description: 'YYYY-MM-DD (astronomical year: 1 BC = 0)' }
const calendar = { type: 'string', enum: ['gregorian', 'julian'] }
export const CALENDAR_TOOLS = [
  { name: 'day_of_week', run: dayOfWeek, description: 'Weekday of a date in the Gregorian or Julian calendar.',
    parameters: { type: 'object', properties: { date, calendar }, required: ['date', 'calendar'] } },
  { name: 'convert_calendar', run: convertCalendar, description: 'Convert a date between the Julian and Gregorian calendars.',
    parameters: { type: 'object', properties: { date, from: calendar }, required: ['date', 'from'] } },
  { name: 'age_at_date', run: ageAtDate, description: 'Exact age (years, months, days) of someone born on birth_date, on on_date.',
    parameters: { type: 'object', properties: { birth_date: date, on_date: date, calendar }, required: ['birth_date', 'on_date'] } },
]
