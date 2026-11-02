// Travel by period means of transport: a distance turned into a time range from typical daily distances. Ranges, not
// points: weather, roads, season, load and rest decide where a real journey lands. Runs under plain node.
import { num } from './physics.ts'

// km per day (a travelling day, rests included) with what the range is based on.
export const MODES: Record<string, { low: number, high: number, label: string, basis: string }> = {
  walking: { low: 20, high: 32, label: 'On foot', basis: 'Typical long-distance walking pace of 4–5 km/h for 5–8 hours a day; Roman marching rates of 20–24 Roman miles (30–35 km) a day were for drilled soldiers.' },
  horse: { low: 40, high: 65, label: 'One horse, ridden', basis: 'A single horse kept up for days covers about 40–65 km a day at a walk and trot; more for a day or two only.' },
  post_relay: { low: 150, high: 300, label: 'Relay riders, changing horses', basis: 'Fresh horses at stages: royal and imperial posts commonly 150–250 km a day; the Pony Express (1860) about 300 km a day.' },
  wagon: { low: 15, high: 30, label: 'Ox cart or loaded wagon', basis: 'Ox or heavy horse wagons move at 3–4 km/h; emigrant wagon trains averaged about 20–25 km a day.' },
  stagecoach_1700s: { low: 50, high: 90, label: 'Stagecoach (around 1700–1750)', basis: 'Early 18th-century English stagecoaches ran by day only on unimproved roads; London–York (about 320 km) took about four days.' },
  mail_coach_1800s: { low: 150, high: 230, label: 'Mail coach on turnpike roads (around 1784–1840)', basis: 'Mail coaches ran day and night with horse changes at about 10–15 km/h; London–York took roughly a day and a half by the 1830s.' },
  sailing_ship: { low: 100, high: 300, label: 'Sailing ship', basis: 'Average 2–6 knots over a passage, winds and currents included; fast clippers made more on good days.' },
  steamship: { low: 300, high: 600, label: 'Steamship (around 1840–1900)', basis: 'Ocean steamers averaged about 7–14 knots over a crossing.' },
  steam_train: { low: 600, high: 1200, label: 'Steam train (around 1850–1900)', basis: 'Average 30–60 km/h including stops, run for about 20 hours of a day; real timetables decide.' },
}

export function periodTravel(a: { distance_km: unknown, mode: unknown }) {
  const d = num(a.distance_km, 'distance_km', { positive: true })
  const mode = MODES[String(a.mode)]
  if (!mode) throw new Error(`mode must be one of ${Object.keys(MODES).join(', ')}`)
  const days = (perDay: number) => Math.round(d / perDay * 10) / 10
  return {
    result: { mode: mode.label, km_per_day: `${mode.low}–${mode.high}`, fastest_days: days(mode.high), slowest_days: days(mode.low) },
    assumptions: [mode.basis, 'Distance is the route distance, not a straight line. Weather, season, road or sea state, load and rest days push a journey past these ranges.'],
  }
}

export const TRAVEL_TOOLS = [
  { name: 'period_travel_time', run: periodTravel, description: 'Range of travel days for a route distance by a historical means of transport (typical daily distances, documented basis).',
    parameters: { type: 'object', properties: { distance_km: { type: 'number', description: 'route distance in km' }, mode: { type: 'string', enum: Object.keys(MODES) } }, required: ['distance_km', 'mode'] } },
]
