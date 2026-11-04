// "Same detail, two answers" (ATTRIBUTE_MISMATCH, server/utils/analysis.ts). A single-valued detail of a subject is stored as
// predicate "<detail>_is" (snake_case: wound_location_is, first_name_is, eye_colour_is) with the answer in `value` and no
// object: "Watson · wound_location_is · shoulder". Only the `_is` form is read this way, so free-form predicates
// ("has_daughter", "owns") stay multi-valued and never clash. The answer never files a wiki page of its own ("shoulder"), but
// when it names an entity that exists ("spouse_is Mary") impact, the wiki and the graph follow it like an object (factNames).

const DETAIL = /^[a-z0-9]+(?:_[a-z0-9]+)*_is$/
export const isDetailPredicate = (p: string | null | undefined) => !!p && DETAIL.test(p)
// "wound_location_is" -> "wound location"
export const detailName = (p: string) => p.replace(/_is$/, '').replace(/_/g, ' ')

// A detail's answer is stored in `value` with no object. One typed in `object` (Add fact's third box, Review's Answer box, a
// model or an agent) is the answer and wins over an older value: an edited answer always replaces the one it corrects.
// Anything that isn't a detail is returned as it came.
export function asDetail<T extends { predicate: string, object?: string | null, value?: string | null }>(f: T): T {
  if (!isDetailPredicate(f.predicate)) return f
  const answer = f.object?.trim() || f.value?.toString().trim() || null
  return { ...f, value: answer, object: null }
}

// The names a fact is about, for impact, the wiki and the graph: subject, object, and a detail's answer (which matches an
// entity only when one has that name).
export const factNames = (f: { subject: string, predicate: string, object: string | null, value?: string | null }) =>
  [f.subject, f.object, isDetailPredicate(f.predicate) ? f.value ?? null : null]

// Two answers to one detail agree when one says no more than the other: words compared without case, punctuation, articles,
// possessives and little linking words, and one word set inside the other ("shoulder" = "the left shoulder" = "his shoulder").
// "left shoulder" vs "right shoulder", "shoulder" vs "leg", "Mrs. Hudson" vs "Mrs. Turner" disagree. A negation on one side
// only ("dead" vs "not dead") always disagrees, so containment never hides a "not".
const FILLER = new Set('a an the his her their its my your our in on at of to'.split(' '))
const NEGATION = new Set('not no never non without'.split(' '))
const words = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(w => w && !FILLER.has(w))
export function sameDetailValue(a: string, b: string) {
  const x = words(a), y = words(b)
  const neg = (w: string[]) => w.some(t => NEGATION.has(t))
  if (neg(x) !== neg(y)) return false
  const [small, big] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)]
  return small.every(w => big.has(w))
}

// When a detail's answer holds: from t_from to t_to (a point when only t_from is set); no time at all = always. An age changes
// with time by definition, so an age (age_is, age_at_marriage_is) is only compared when both answers say when they hold.
const AGE = /(^|_)age(_|$)/
const span = (f: { t_from: number | null, t_to: number | null }): [number, number] =>
  [f.t_from ?? -Infinity, f.t_to ?? f.t_from ?? Infinity]
export function holdTogether(a: { t_from: number | null, t_to: number | null }, b: { t_from: number | null, t_to: number | null }) {
  const [a0, a1] = span(a), [b0, b1] = span(b)
  return a0 <= b1 && b0 <= a1
}

// An answer that names no particular value ("one of my limbs", "an unnamed wife", "unknown") fits any answer: it never clashes.
const VAGUE = /^(?:(?:an?|the|his|her|their|its|my)\s+)?(?:one of|some|any|either|unknown|unnamed|unspecified|somewhere|someone|something)\b/i
export const isVagueAnswer = (v: string) => VAGUE.test(v.trim())

type DetailFact = { predicate: string, value: string | null, t_from: number | null, t_to: number | null }
// Whether two facts about one subject give the same single-valued detail two different answers at once.
export function detailClash(a: DetailFact, b: DetailFact) {
  return isDetailPredicate(a.predicate) && a.predicate === b.predicate && !!a.value?.trim() && !!b.value?.trim()
    && !isVagueAnswer(a.value!) && !isVagueAnswer(b.value!) && !sameDetailValue(a.value!, b.value!) && holdTogether(a, b)
    && (!AGE.test(a.predicate) || (a.t_from != null && b.t_from != null))
}

// Death (ACTS_AFTER_DEATH, server/utils/analysis.ts). The name a fact says dies: the subject of a death predicate ("dies",
// "died_ringing", "dies_at", "is_dead", "death", "cause_of_death_is", "killed_by"), the subject of a state detail answered
// dead ("alive_is dead", "status_is deceased"), or the object of a killing ("Small · killed · the convict-guard").
const DIES = /^(?:die|dies|died|dead|is_dead|death|perishes|perished|drowned|was_killed|was_murdered|was_slain|killed_by|murdered_by|slain_by)(?:_|$)|^(?:cause_of_death|death_date|date_of_death)_is$/
const KILLS = /^(?:kill|kills|killed|murder|murders|murdered|slays|slew|executes|executed|assassinates|assassinated)$/
const STATE = /^(?:alive|status|state|life_status|vital_status|condition)_is$/
const deadAnswer = (v: string | null | undefined) => /^(?:dead|deceased|killed|slain|died|murdered)$/.test((v ?? '').toLowerCase().replace(/[^\p{L}\s]+/gu, '').trim())
type LifeFact = { kind?: string, subject: string, predicate: string, object: string | null, value?: string | null }
export function diesIn(f: LifeFact): string | null {
  if (DIES.test(f.predicate) || (STATE.test(f.predicate) && deadAnswer(f.value))) return f.subject
  if (KILLS.test(f.predicate) && f.object?.trim()) return f.object
  return null
}
// Whether a fact has its subject doing or being something only the living do. Buried, mourned, remembered, mentioned or named
// after, a ghost or a body, a world rule, an identity ("is the old king") or a detail (other than "alive_is alive") are not
// acts: a dead character keeps those.
const PASSIVE = /(?:^|_)(?:buried|burial|funeral|grave|tomb|corpse|body|remains|mourned|remembered|memorial|mentioned|named|legacy|ghost|spirit|haunts|haunted|posthumous|ancestor|inherited|honoured|honored|avenged|statue|portrait)(?:_|$)/
export function actsAlive(f: LifeFact) {
  if (f.kind === 'rule' || diesIn(f) || PASSIVE.test(f.predicate) || f.predicate === 'is') return false
  if (isDetailPredicate(f.predicate)) return STATE.test(f.predicate) && !!f.value?.trim()
  return true
}
