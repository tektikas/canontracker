// Time since death, always as a range with its assumptions: body cooling (Henssge's nomogram model) and the stages of rigor
// and livor mortis (typical ranges from the forensic literature, Henssge & Madea). For fiction research, not casework.
// Runs under plain node.
import { num } from './physics.ts'

type Range = [number, number | null] // hours; null = open-ended

// Henssge: Q = (Tr − Ta)/(37.2 − Ta) = A·e^(B·t) + (1 − A)·e^(k·B·t), B = −1.2815·(cf·m)^−0.625 + 0.0284.
export function henssge(rectal: number, ambient: number, massKg: number, cf: number) {
  const q = (rectal - ambient) / (37.2 - ambient)
  if (!(rectal > ambient)) throw new Error('rectal temperature must be above the ambient temperature for the cooling model')
  if (q >= 1) return { q, hours: 0 }
  const B = -1.2815 * (cf * massKg) ** -0.625 + 0.0284
  const [A, k] = ambient <= 23 ? [1.25, 5] : [1.11, 10]
  const f = (t: number) => A * Math.exp(B * t) + (1 - A) * Math.exp(k * B * t)
  let lo = 0
  let hi = 200
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > q) lo = mid
    else hi = mid
  }
  return { q, hours: (lo + hi) / 2 }
}

export const RIGOR: Record<string, { range: Range, label: string }> = {
  developing: { range: [0.5, 7], label: 'rigor developing (some joints stiff)' },
  full: { range: [2, 96], label: 'full rigor (all joints stiff)' },
  resolving: { range: [24, 96], label: 'rigor resolving' },
  resolved: { range: [24, null], label: 'rigor fully resolved' },
}
export const LIVOR: Record<string, { range: Range, label: string }> = {
  beginning: { range: [0.25, 3], label: 'first patches of livor' },
  confluent_blanching: { range: [1, 20], label: 'confluent livor that blanches fully under thumb pressure' },
  partly_blanching: { range: [10, 30], label: 'livor that blanches only partly' },
  fixed: { range: [10, null], label: 'fixed livor (does not blanch)' },
}

const r1 = (x: number) => Math.round(x * 10) / 10
export function timeSinceDeath(a: { rectal_temp_c?: unknown, ambient_temp_c?: unknown, body_mass_kg?: unknown, corrective_factor?: unknown, rigor?: unknown, livor?: unknown }) {
  const methods: { method: string, from_hours: number, to_hours: number | null, note: string }[] = []
  const assumptions: string[] = []
  if (a.rectal_temp_c != null) {
    const rectal = num(a.rectal_temp_c, 'rectal_temp_c')
    const ambient = num(a.ambient_temp_c, 'ambient_temp_c')
    const massGiven = a.body_mass_kg != null
    const mass = massGiven ? num(a.body_mass_kg, 'body_mass_kg', { positive: true }) : 70
    const cf = a.corrective_factor == null ? 1 : num(a.corrective_factor, 'corrective_factor', { positive: true })
    const { hours, q } = henssge(rectal, ambient, mass, cf)
    const spread = cf === 1 ? 2.8 : 4.5
    methods.push(q >= 1
      ? { method: 'body cooling', from_hours: 0, to_hours: 3, note: 'Body still at or above normal temperature: death very recent, or the body was warm (fever, exertion, hot room).' }
      : { method: 'body cooling (Henssge)', from_hours: r1(Math.max(0, hours - spread)), to_hours: r1(hours + spread), note: `Best estimate ${r1(hours)} h; 95% range ±${spread} h.` })
    assumptions.push(`Cooling: rectal ${rectal} °C, constant ambient ${ambient} °C, ${massGiven ? '' : 'assumed '}body mass ${mass} kg, corrective factor ${cf} (1 = naked or light clothing, still air; dry clothing/covers raise it, wet or moving air lower it), normal body temperature 37.2 °C at death.`)
  }
  for (const [key, table, what] of [['rigor', RIGOR, 'rigor'], ['livor', LIVOR, 'livor']] as const) {
    const v = a[key]
    if (v == null || v === '') continue
    const stage = table[String(v)]
    if (!stage) throw new Error(`${what} must be one of ${Object.keys(table).join(', ')}`)
    methods.push({ method: stage.label, from_hours: stage.range[0], to_hours: stage.range[1], note: 'Typical range at moderate temperatures; heat speeds it up, cold slows it.' })
  }
  if (!methods.length) throw new Error('give rectal_temp_c with ambient_temp_c, or a rigor or livor stage')
  const from = Math.max(...methods.map(m => m.from_hours))
  const ends = methods.map(m => m.to_hours).filter((x): x is number => x != null)
  const to = ends.length ? Math.min(...ends) : null
  const consistent = to == null || from <= to
  assumptions.push('Ranges, not a time: individual cases fall outside them. Fiction research, not forensic casework.')
  return {
    result: { methods, combined: consistent ? { from_hours: from, to_hours: to } : null, ...(!consistent && { note: 'The methods do not overlap: one of the inputs does not fit the others.' }) },
    assumptions,
  }
}

export const FORENSICS_TOOLS = [
  { name: 'time_since_death', run: timeSinceDeath,
    description: 'Range of hours since death from rectal/ambient temperature (Henssge cooling model) and/or rigor and livor stages; returns each method and their overlap.',
    parameters: { type: 'object', properties: {
      rectal_temp_c: { type: 'number' }, ambient_temp_c: { type: 'number' }, body_mass_kg: { type: 'number' },
      corrective_factor: { type: 'number', description: '1 naked/still air; ~1.1–1.4 clothed or covered; ~0.7 wet or in moving air' },
      rigor: { type: 'string', enum: Object.keys(RIGOR) }, livor: { type: 'string', enum: Object.keys(LIVOR) },
    }, required: [] } },
]
