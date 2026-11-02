// Self-check for the research calculators (server/utils/calculators). Run: node scripts/calculators-check.ts
// Reference values are published ones (ephemerides, almanacs, textbook orbits), checked within the stated precision.
import assert from 'node:assert/strict'
import { CALCULATORS } from '../server/utils/calculators/index.ts'

const run = (name: string, args: Record<string, unknown>) => {
  const tool = CALCULATORS.find(t => t.name === name)
  assert.ok(tool, `tool ${name}`)
  const out = tool.run(args)
  assert.ok(out.assumptions.length, `${name} states its assumptions`)
  return out.result as any
}
const near = (got: number, want: number, tol: number, what: string) => assert.ok(Math.abs(got - want) <= tol, `${what}: got ${got}, want ${want} ± ${tol}`)
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const throws = (name: string, args: Record<string, unknown>, re: RegExp) => assert.throws(() => run(name, args), re)

// Every tool has a unique name and an object schema.
assert.equal(new Set(CALCULATORS.map(t => t.name)).size, CALCULATORS.length)
for (const t of CALCULATORS) assert.equal((t.parameters as { type: string }).type, 'object')

// Physics
near(run('light_delay', { distance: 1, distance_unit: 'au' }).one_way.seconds, 499.0, 0.1, '1 AU light time')
near(run('light_delay', { distance: 628e6, distance_unit: 'km' }).one_way.minutes, 34.91, 0.01, 'Europa at 628 million km')
const hoh = run('hohmann_transfer', { r1: 1, r2: 1.524, unit: 'au', central_body: 'sun' })
near(hoh.transfer_time.days, 259, 1, 'Earth→Mars Hohmann days')
near(hoh.delta_v_total_km_s, 5.59, 0.03, 'Earth→Mars Hohmann Δv')
near(run('rocket_delta_v', { wet_mass: Math.E, dry_mass: 1, isp_s: 450 }).delta_v_km_s, 4.413, 0.001, 'rocket equation')
throws('rocket_delta_v', { wet_mass: 1, dry_mass: 2, isp_s: 300 }, /less than wet_mass/)
const earth = run('surface_gravity', { mass: 1, mass_unit: 'earth', radius: 1, radius_unit: 'earth' })
near(earth.gravity_m_s2, 9.82, 0.01, 'Earth surface gravity')
near(earth.escape_velocity_km_s, 11.19, 0.01, 'Earth escape velocity')
const dose = run('radiation_dose', { dose_rate: 100, at_distance: 1, to_distance: 2, shielding_half_value_layers: 1, exposure_hours: 2 })
assert.equal(dose.dose_rate_at_target, 12.5)
assert.equal(dose.total_dose, 25)
// Low speed: relativistic ≈ Newtonian. Alpha Centauri at 1 g: ~3.6 years ship time, ~6 years Earth time.
const short = run('constant_acceleration_trip', { distance: 1e6, distance_unit: 'km', acceleration_g: 1 })
near(short.trip_time.hours, short.newtonian_trip_time_hours, 0.001, '1e6 km at 1 g')
const ac = run('constant_acceleration_trip', { distance: 4.37, distance_unit: 'ly', acceleration_g: 1 })
near(ac.ship_time.years, 3.6, 0.1, 'Alpha Centauri ship time')
near(ac.trip_time.years, 5.9, 0.15, 'Alpha Centauri Earth time')
assert.ok(ac.peak_speed_fraction_of_c < 1)
throws('light_delay', { distance: -1, distance_unit: 'km' }, /greater than 0/)
throws('light_delay', { distance: 1, distance_unit: 'parsec' }, /distance_unit/)

// Calendar
assert.equal(run('day_of_week', { date: '1888-11-09', calendar: 'gregorian' }).weekday, 'Friday')
assert.equal(run('day_of_week', { date: '2000-01-01', calendar: 'gregorian' }).weekday, 'Saturday')
assert.equal(run('day_of_week', { date: '1582-10-04', calendar: 'julian' }).weekday, 'Thursday')
assert.equal(run('convert_calendar', { date: '1582-10-04', from: 'julian' }).gregorian, '1582-10-14')
assert.equal(run('convert_calendar', { date: '1616-04-23', from: 'julian' }).gregorian, '1616-05-03') // Shakespeare's death
assert.equal(run('convert_calendar', { date: '1752-09-14', from: 'gregorian' }).julian, '1752-09-03') // Britain's switch
throws('day_of_week', { date: '1900-02-29', calendar: 'gregorian' }, /does not exist/)
assert.equal(run('day_of_week', { date: '1900-02-29', calendar: 'julian' }).weekday, 'Tuesday') // Julian leap day = Gregorian 1900-03-13
throws('day_of_week', { date: '9 Nov 1888' }, /YYYY-MM-DD/)
assert.deepEqual((({ years, months, days }) => [years, months, days])(run('age_at_date', { birth_date: '1990-05-20', on_date: '2026-11-02' })), [36, 5, 13])
assert.deepEqual((({ years, months, days }) => [years, months, days])(run('age_at_date', { birth_date: '2000-02-29', on_date: '2001-02-28' })), [0, 11, 30])
throws('age_at_date', { birth_date: '2000-01-02', on_date: '2000-01-01' }, /before birth_date/)

// Sky: full moon 2024-04-23 23:49 UTC; new moon 2024-04-08 18:21 UTC (total solar eclipse); full moon 2000-01-21 04:40 UTC.
const apr = run('moon_phase', { date: '2024-04-20' })
assert.equal(apr.next_full_moon_utc.slice(0, 10), '2024-04-23')
near(minutes(apr.next_full_moon_utc.slice(11)), 23 * 60 + 49, 40, 'full moon 2024-04-23')
assert.equal(apr.previous_new_moon_utc.slice(0, 10), '2024-04-08')
near(minutes(apr.previous_new_moon_utc.slice(11)), 18 * 60 + 21, 40, 'new moon 2024-04-08')
const y2k = run('moon_phase', { date: '2000-01-21', time_utc: '04:40' })
assert.equal(y2k.phase, 'full moon')
assert.ok(y2k.illuminated_percent > 99.5)
assert.equal(run('moon_phase', { date: '2024-04-08', time_utc: '18:21' }).phase, 'new moon')
throws('moon_phase', { date: '2024-04-08', time_utc: '25:00' }, /HH:MM/)
// London, 21 June 2024: sunrise 03:43 UTC, sunset 20:21 UTC (timeanddate.com).
const ldn = run('sun_times', { date: '2024-06-21', latitude: 51.5074, longitude: -0.1278 })
near(minutes(ldn.sunrise), 3 * 60 + 43, 2, 'London sunrise')
near(minutes(ldn.sunset), 20 * 60 + 21, 2, 'London sunset')
assert.equal(run('sun_times', { date: '2024-06-21', latitude: 51.5074, longitude: -0.1278, utc_offset_hours: 1 }).sunrise, ldn.sunrise.replace(/^03/, '04'))
assert.equal(run('sun_times', { date: '2024-12-21', latitude: 78.22, longitude: 15.65 }).sunrise, null) // Svalbard polar night
assert.match(run('sun_times', { date: '2024-12-21', latitude: 78.22, longitude: 15.65 }).note, /polar night/)

// Travel: London → York is about 320 km by road.
const york = run('period_travel_time', { distance_km: 320, mode: 'stagecoach_1700s' })
assert.ok(york.fastest_days <= 4 && york.slowest_days >= 4, 'about four days by 1700s stagecoach')
assert.equal(run('period_travel_time', { distance_km: 100, mode: 'walking' }).fastest_days, 3.1)
throws('period_travel_time', { distance_km: 100, mode: 'teleport' }, /mode must be one of/)

// Forensics: 28 °C rectal at 10 °C ambient, 70 kg, naked: Q = 18/27.2 = 0.662, B = -0.0617/h; by hand 1.25e^(10B) - 0.25e^(50B) = 0.663, so ≈ 10 h, ±2.8 h.
const tod = run('time_since_death', { rectal_temp_c: 28, ambient_temp_c: 10 })
const cooling = tod.methods[0]
near((cooling.from_hours + cooling.to_hours) / 2, 10, 0.2, 'Henssge best estimate')
near(cooling.to_hours - cooling.from_hours, 5.6, 0.05, 'Henssge 95% width')
assert.deepEqual(tod.combined, { from_hours: cooling.from_hours, to_hours: cooling.to_hours })
// Cooling + full rigor + fixed livor narrow to their overlap; a still-warm body is "very recent".
const both = run('time_since_death', { rectal_temp_c: 28, ambient_temp_c: 10, rigor: 'full', livor: 'fixed' })
assert.equal(both.combined.from_hours, Math.max(cooling.from_hours, 10))
assert.equal(both.combined.to_hours, cooling.to_hours)
assert.equal(run('time_since_death', { rectal_temp_c: 37.5, ambient_temp_c: 20 }).methods[0].to_hours, 3)
assert.equal(run('time_since_death', { rigor: 'developing', livor: 'fixed' }).combined, null) // contradictory stages
throws('time_since_death', {}, /give rectal_temp_c/)
throws('time_since_death', { rectal_temp_c: 8, ambient_temp_c: 10 }, /above the ambient/)

console.log(`calculators-check: ${CALCULATORS.length} tools, all checks passed`)
