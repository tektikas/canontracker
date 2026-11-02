// Physics calculators for research answers. Deterministic, SI inside, no imports (scripts/calculators-check.ts runs them
// under plain node). Every result lists the assumptions it rests on, so the answer can state them.

const C = 299_792.458 // km/s
const G0 = 9.80665 // m/s²
const G = 6.674_30e-11 // m³/(kg·s²)
const AU_KM = 149_597_870.7
const LY_KM = 9_460_730_472_580.8
const R = (x: number, sig = 5) => Number(x.toPrecision(sig))

export function num(v: unknown, name: string, opts: { min?: number, positive?: boolean } = {}) {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`${name} must be a number`)
  if (opts.positive && n <= 0) throw new Error(`${name} must be greater than 0`)
  if (opts.min !== undefined && n < opts.min) throw new Error(`${name} must be at least ${opts.min}`)
  return n
}
const DIST: Record<string, number> = { km: 1, au: AU_KM, ly: LY_KM, m: 0.001 }
export function toKm(value: unknown, unit: unknown) {
  const u = typeof unit === 'string' ? unit.toLowerCase() : 'km'
  if (!DIST[u]) throw new Error('distance_unit must be km, m, au or ly')
  return num(value, 'distance', { positive: true }) * DIST[u]
}
const duration = (s: number) => ({ seconds: R(s), minutes: R(s / 60), hours: R(s / 3600), days: R(s / 86400), years: R(s / 31_557_600) })

/** Accelerate at a constant rate to the midpoint, flip, decelerate to rest (a "brachistochrone" trip). Relativistic. */
export function constantAccelerationTrip(a: { distance: unknown, distance_unit?: unknown, acceleration_g: unknown }) {
  const dKm = toKm(a.distance, a.distance_unit)
  const acc = num(a.acceleration_g, 'acceleration_g', { positive: true }) * G0 / 1000 // km/s²
  const half = dKm / 2
  const tHalf = Math.sqrt((half / C) ** 2 + 2 * half / acc) // coordinate time, s
  const tauHalf = (C / acc) * Math.acosh(1 + acc * half / C ** 2) // ship (proper) time, s
  const vPeak = acc * tHalf / Math.sqrt(1 + (acc * tHalf / C) ** 2)
  const newtonian = 2 * Math.sqrt(dKm / acc)
  return {
    result: {
      trip_time: duration(2 * tHalf), ship_time: duration(2 * tauHalf), peak_speed_km_s: R(vPeak), peak_speed_fraction_of_c: R(vPeak / C, 4),
      newtonian_trip_time_hours: R(newtonian / 3600),
    },
    assumptions: ['Constant acceleration to the midpoint, then constant deceleration to rest at the destination.',
      'Straight-line distance; the target does not move during the trip.', 'Special relativity included; no fuel or mass limits.'],
  }
}

const MU: Record<string, number> = { sun: 1.327_124_400_18e20, earth: 3.986_004_418e14, moon: 4.904_869_5e12, mars: 4.282_837e13, jupiter: 1.266_865_34e17, saturn: 3.793_118_7e16 }
/** Hohmann transfer between two circular, coplanar orbits around one central body. */
export function hohmannTransfer(a: { r1: unknown, r2: unknown, unit?: unknown, central_body?: unknown }) {
  const body = typeof a.central_body === 'string' ? a.central_body.toLowerCase() : 'sun'
  const mu = MU[body]
  if (!mu) throw new Error(`central_body must be one of ${Object.keys(MU).join(', ')}`)
  const r1 = toKm(a.r1, a.unit ?? 'au') * 1000
  const r2 = toKm(a.r2, a.unit ?? 'au') * 1000
  const at = (r1 + r2) / 2
  const t = Math.PI * Math.sqrt(at ** 3 / mu)
  const dv1 = Math.abs(Math.sqrt(mu / r1) * (Math.sqrt(2 * r2 / (r1 + r2)) - 1))
  const dv2 = Math.abs(Math.sqrt(mu / r2) * (1 - Math.sqrt(2 * r1 / (r1 + r2))))
  return {
    result: { transfer_time: duration(t), delta_v_departure_km_s: R(dv1 / 1000), delta_v_arrival_km_s: R(dv2 / 1000), delta_v_total_km_s: R((dv1 + dv2) / 1000) },
    assumptions: [`Circular, coplanar orbits around the ${body}; impulsive burns.`, 'Δv is relative to the circular orbits (no planetary escape or capture burns).',
      'Real launch windows depend on planetary positions (synodic period).'],
  }
}

/** Tsiolkovsky rocket equation. */
export function rocketDeltaV(a: { wet_mass: unknown, dry_mass: unknown, isp_s?: unknown, exhaust_velocity_km_s?: unknown }) {
  const m0 = num(a.wet_mass, 'wet_mass', { positive: true })
  const mf = num(a.dry_mass, 'dry_mass', { positive: true })
  if (mf >= m0) throw new Error('dry_mass must be less than wet_mass')
  const ve = a.exhaust_velocity_km_s != null ? num(a.exhaust_velocity_km_s, 'exhaust_velocity_km_s', { positive: true }) * 1000
    : num(a.isp_s, 'isp_s', { positive: true }) * G0
  const dv = ve * Math.log(m0 / mf)
  return { result: { delta_v_km_s: R(dv / 1000), mass_ratio: R(m0 / mf), exhaust_velocity_km_s: R(ve / 1000) }, assumptions: ['Ideal rocket equation: no gravity or drag losses, one stage.'] }
}

/** Time for light (or radio) to cross a distance. */
export function lightDelay(a: { distance: unknown, distance_unit?: unknown }) {
  const s = toKm(a.distance, a.distance_unit) / C
  return { result: { one_way: duration(s), round_trip: duration(2 * s) }, assumptions: ['Signal travels at c in vacuum along a straight line.'] }
}

const MASS: Record<string, number> = { kg: 1, earth: 5.9722e24, jupiter: 1.898_13e27, moon: 7.342e22, sun: 1.988_47e30 }
const RADIUS: Record<string, number> = { km: 1000, earth: 6_371_000, jupiter: 69_911_000, moon: 1_737_400, sun: 695_700_000 }
/** Surface gravity and escape velocity of a spherical body. */
export function surfaceGravity(a: { mass: unknown, mass_unit?: unknown, radius: unknown, radius_unit?: unknown }) {
  const mu = MASS[String(a.mass_unit ?? 'earth').toLowerCase()]
  const ru = RADIUS[String(a.radius_unit ?? 'earth').toLowerCase()]
  if (!mu) throw new Error(`mass_unit must be one of ${Object.keys(MASS).join(', ')}`)
  if (!ru) throw new Error(`radius_unit must be one of ${Object.keys(RADIUS).join(', ')}`)
  const m = num(a.mass, 'mass', { positive: true }) * mu
  const r = num(a.radius, 'radius', { positive: true }) * ru
  const g = G * m / r ** 2
  return { result: { gravity_m_s2: R(g), gravity_g: R(g / G0), escape_velocity_km_s: R(Math.sqrt(2 * G * m / r) / 1000) }, assumptions: ['Uniform, non-rotating sphere.'] }
}

/** Dose rate from a point source scaled by distance (inverse square) and shielding (half-value layers). */
export function radiationDose(a: { dose_rate: unknown, at_distance: unknown, to_distance: unknown, shielding_half_value_layers?: unknown, exposure_hours?: unknown }) {
  const d1 = num(a.at_distance, 'at_distance', { positive: true })
  const d2 = num(a.to_distance, 'to_distance', { positive: true })
  const hvl = a.shielding_half_value_layers == null ? 0 : num(a.shielding_half_value_layers, 'shielding_half_value_layers', { min: 0 })
  const rate = num(a.dose_rate, 'dose_rate', { min: 0 }) * (d1 / d2) ** 2 * 0.5 ** hvl
  const hours = a.exposure_hours == null ? null : num(a.exposure_hours, 'exposure_hours', { min: 0 })
  return {
    result: { dose_rate_at_target: R(rate), ...(hours != null && { total_dose: R(rate * hours) }), units: 'same unit as dose_rate (per hour); total in that unit × hours' },
    assumptions: ['Point source, inverse-square law (distances in the same unit).', 'Each half-value layer halves the dose rate; build-up and scatter ignored.', 'Constant source strength (no decay over the exposure).'],
  }
}

const n = { type: 'number' }
const dist = { type: 'number', description: 'the full number in distance_unit, e.g. 628000000 for 628 million km' }
const s = (desc: string, e?: string[]) => ({ type: 'string', description: desc, ...(e && { enum: e }) })
export const PHYSICS_TOOLS = [
  { name: 'constant_acceleration_trip', run: constantAccelerationTrip,
    description: 'Travel time for a ship that accelerates at a constant g to the midpoint and decelerates to rest (relativistic). Also gives ship time and peak speed.',
    parameters: { type: 'object', properties: { distance: dist, distance_unit: s('km, au or ly', ['km', 'au', 'ly']), acceleration_g: { type: 'number', description: 'acceleration in Earth g (1 = 9.81 m/s²)' } }, required: ['distance', 'distance_unit', 'acceleration_g'] } },
  { name: 'hohmann_transfer', run: hohmannTransfer,
    description: 'Hohmann transfer time and Δv between two circular orbits around one body (e.g. Earth 1 AU → Mars 1.524 AU around the sun).',
    parameters: { type: 'object', properties: { r1: { type: 'number', description: 'full number in unit, e.g. 1 au or 6771 km' }, r2: { type: 'number', description: 'full number in unit' }, unit: s('km or au', ['km', 'au']), central_body: s('central body', Object.keys(MU)) }, required: ['r1', 'r2', 'unit', 'central_body'] } },
  { name: 'rocket_delta_v', run: rocketDeltaV,
    description: 'Tsiolkovsky rocket equation: Δv from wet mass, dry mass and specific impulse (or exhaust velocity).',
    parameters: { type: 'object', properties: { wet_mass: n, dry_mass: n, isp_s: n, exhaust_velocity_km_s: n }, required: ['wet_mass', 'dry_mass'] } },
  { name: 'light_delay', run: lightDelay,
    description: 'One-way and round-trip light/radio signal delay over a distance.',
    parameters: { type: 'object', properties: { distance: dist, distance_unit: s('km, au or ly', ['km', 'au', 'ly']) }, required: ['distance', 'distance_unit'] } },
  { name: 'surface_gravity', run: surfaceGravity,
    description: 'Surface gravity and escape velocity from mass and radius.',
    parameters: { type: 'object', properties: { mass: n, mass_unit: s('kg or a body', Object.keys(MASS)), radius: n, radius_unit: s('km or a body', Object.keys(RADIUS)) }, required: ['mass', 'mass_unit', 'radius', 'radius_unit'] } },
  { name: 'radiation_dose', run: radiationDose,
    description: 'Scale a dose rate from a point source to another distance (inverse square) and through shielding half-value layers; optional total over hours.',
    parameters: { type: 'object', properties: { dose_rate: n, at_distance: n, to_distance: n, shielding_half_value_layers: n, exposure_hours: n }, required: ['dose_rate', 'at_distance', 'to_distance'] } },
]
