// Sky calculators: moon phase (low-precision lunar and solar longitudes, Meeus ch. 25/47 main terms; phase times good to
// well under an hour) and sunrise/sunset/civil twilight (NOAA solar calculator; about a minute away from the horizon at
// latitudes below ~65°). Runs under plain node (scripts/calculators-check.ts).
import { calOf, fmt, fromJdn, parseDate, toJdn } from './calendar.ts'
import type { Cal } from './calendar.ts'
import { num } from './physics.ts'

const rad = (d: number) => d * Math.PI / 180
const deg = (r: number) => r * 180 / Math.PI
const mod = (x: number, m: number) => ((x % m) + m) % m
const SYNODIC = 29.530_588_853

function parseTime(v: unknown) {
  if (v == null || v === '') return 12 * 60
  const m = typeof v === 'string' ? v.trim().match(/^(\d{1,2}):(\d{2})$/) : null
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('time must be HH:MM (24-hour)')
  return Number(m[1]) * 60 + Number(m[2])
}

/** Moon minus sun ecliptic longitude, degrees 0–360 (0 = new, 180 = full). */
export function elongation(jd: number) {
  const T = (jd - 2_451_545) / 36_525
  const M = rad(357.529_109_2 + 35_999.050_290_9 * T)
  const sun = 280.466_46 + 36_000.769_83 * T + (1.914_602 - 0.004_817 * T) * Math.sin(M) + 0.019_993 * Math.sin(2 * M) + 0.000_289 * Math.sin(3 * M)
  const Lp = 218.316_447_7 + 481_267.881_234_21 * T
  const D = rad(297.850_192_1 + 445_267.111_403_4 * T)
  const Mp = rad(134.963_396_4 + 477_198.867_505_5 * T)
  const F = rad(93.272_095 + 483_202.017_523_3 * T)
  const moon = Lp + 6.288_774 * Math.sin(Mp) + 1.274_027 * Math.sin(2 * D - Mp) + 0.658_314 * Math.sin(2 * D) + 0.213_618 * Math.sin(2 * Mp)
    - 0.185_116 * Math.sin(M) - 0.114_332 * Math.sin(2 * F) + 0.058_793 * Math.sin(2 * D - 2 * Mp) + 0.057_066 * Math.sin(2 * D - M - Mp)
    + 0.053_322 * Math.sin(2 * D + Mp) + 0.045_758 * Math.sin(2 * D - M) - 0.040_923 * Math.sin(M - Mp) - 0.034_72 * Math.sin(D)
    - 0.030_383 * Math.sin(M + Mp)
  return mod(moon - sun, 360)
}

// Newton steps on the elongation: the moon gains ~12.19° a day on the sun.
function phaseTime(jd: number, target: number, dir: 1 | -1) {
  let t = jd + dir * mod(dir * (target - elongation(jd)), 360) / 12.19
  for (let i = 0; i < 8; i++) t += (mod(target - elongation(t) + 180, 360) - 180) / 12.19
  return t
}

function jdString(jd: number, cal: Cal, offsetH = 0) {
  const local = jd + 0.5 + offsetH / 24
  const day = Math.floor(local)
  const mins = Math.round((local - day) * 1440)
  const date = fromJdn(day + Math.floor(mins / 1440), cal)
  const mm = mins % 1440
  return `${fmt(date)} ${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
}

const PHASES: [number, string][] = [[10, 'new moon'], [80, 'waxing crescent'], [100, 'first quarter'], [170, 'waxing gibbous'], [190, 'full moon'],
  [260, 'waning gibbous'], [280, 'last quarter'], [350, 'waning crescent'], [361, 'new moon']]

export function moonPhase(a: { date: unknown, time_utc?: unknown, calendar?: unknown }) {
  const cal = calOf(a.calendar)
  const jd = toJdn(parseDate(a.date, cal), cal) - 0.5 + parseTime(a.time_utc) / 1440
  const e = elongation(jd)
  return {
    result: {
      phase: PHASES.find(([lim]) => e < lim)![1], illuminated_percent: Math.round((1 - Math.cos(rad(e))) / 2 * 1000) / 10,
      age_days: Math.round(e / 360 * SYNODIC * 10) / 10,
      previous_full_moon_utc: jdString(phaseTime(jd, 180, -1), cal), next_full_moon_utc: jdString(phaseTime(jd, 180, 1), cal),
      previous_new_moon_utc: jdString(phaseTime(jd, 0, -1), cal), next_new_moon_utc: jdString(phaseTime(jd, 0, 1), cal),
    },
    assumptions: [`Moon at ${a.time_utc || '12:00'} UTC on that ${cal} date; geocentric phase (the same everywhere on Earth).`, 'Low-precision lunar theory: phase times within about half an hour. Weather and moonrise are not included.'],
  }
}

export function sunTimes(a: { date: unknown, latitude: unknown, longitude: unknown, utc_offset_hours?: unknown, calendar?: unknown }) {
  const cal = calOf(a.calendar)
  const lat = num(a.latitude, 'latitude')
  const lon = num(a.longitude, 'longitude')
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('latitude must be within ±90 and longitude within ±180 (east positive)')
  const offset = a.utc_offset_hours == null ? 0 : num(a.utc_offset_hours, 'utc_offset_hours')
  const jdn = toJdn(parseDate(a.date, cal), cal)
  const jc = (jdn - lon / 360 - 2_451_545) / 36_525 // local solar noon of that date
  const L0 = mod(280.466_46 + jc * (36_000.769_83 + jc * 0.000_303_2), 360)
  const M = 357.529_11 + jc * (35_999.050_29 - 0.000_153_7 * jc)
  const ecc = 0.016_708_634 - jc * (0.000_042_037 + 0.000_000_126_7 * jc)
  const C = Math.sin(rad(M)) * (1.914_602 - jc * (0.004_817 + 0.000_014 * jc)) + Math.sin(rad(2 * M)) * (0.019_993 - 0.000_101 * jc) + Math.sin(rad(3 * M)) * 0.000_289
  const omega = rad(125.04 - 1934.136 * jc)
  const app = rad(L0 + C - 0.005_69 - 0.004_78 * Math.sin(omega))
  const obliq = rad(23 + (26 + (21.448 - jc * (46.815 + jc * (0.000_59 - jc * 0.001_813))) / 60) / 60 + 0.002_56 * Math.cos(omega))
  const decl = Math.asin(Math.sin(obliq) * Math.sin(app))
  const y = Math.tan(obliq / 2) ** 2
  const l0 = rad(L0)
  const m = rad(M)
  const eqTime = 4 * deg(y * Math.sin(2 * l0) - 2 * ecc * Math.sin(m) + 4 * ecc * y * Math.sin(m) * Math.cos(2 * l0) - 0.5 * y * y * Math.sin(4 * l0) - 1.25 * ecc * ecc * Math.sin(2 * m))
  const noon = 720 - 4 * lon - eqTime + offset * 60 // minutes after local midnight
  const clock = (mins: number) => {
    const d = Math.floor(mins / 1440)
    const t = Math.round(mod(mins, 1440))
    return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}${d ? ` (${d > 0 ? 'next' : 'previous'} day)` : ''}`
  }
  const at = (zenith: number) => {
    const cosH = Math.cos(rad(zenith)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl)
    if (cosH > 1) return 'below' as const
    if (cosH < -1) return 'above' as const
    const h = deg(Math.acos(cosH)) * 4
    return { rise: clock(noon - h), set: clock(noon + h), minutes: Math.round(2 * h) }
  }
  const sun = at(90.833)
  const civil = at(96)
  return {
    result: {
      ...(typeof sun === 'object'
        ? { sunrise: sun.rise, sunset: sun.set, day_length_hours: Math.round(sun.minutes / 6) / 10 }
        : { sunrise: null, sunset: null, note: sun === 'below' ? 'The sun does not rise (polar night).' : 'The sun does not set (midnight sun).' }),
      ...(typeof civil === 'object' && { civil_dawn: civil.rise, civil_dusk: civil.set }),
      solar_noon: clock(noon), times_are: `UTC${offset >= 0 ? '+' : ''}${offset}`,
    },
    assumptions: [`Times in UTC${offset >= 0 ? '+' : ''}${offset} on that ${cal} date; sea-level horizon with standard refraction (sun's upper limb).`,
      'Civil dusk/dawn: sun 6° below the horizon. Local clocks before standard time (e.g. Britain before 1880) kept local mean time instead.'],
  }
}

const date = { type: 'string', description: 'YYYY-MM-DD' }
const calendar = { type: 'string', enum: ['gregorian', 'julian'] }
export const SKY_TOOLS = [
  { name: 'moon_phase', run: moonPhase, description: 'Moon phase and illumination on a date, plus the previous/next full and new moon (UTC).',
    parameters: { type: 'object', properties: { date, time_utc: { type: 'string', description: 'HH:MM, default 12:00' }, calendar }, required: ['date'] } },
  { name: 'sun_times', run: sunTimes, description: 'Sunrise, sunset, civil dawn/dusk and solar noon for a date and place.',
    parameters: { type: 'object', properties: { date, latitude: { type: 'number' }, longitude: { type: 'number', description: 'east positive' }, utc_offset_hours: { type: 'number' }, calendar }, required: ['date', 'latitude', 'longitude'] } },
]
