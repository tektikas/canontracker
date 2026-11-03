// "Same detail, two answers" (ATTRIBUTE_MISMATCH, server/utils/analysis.ts). A single-valued detail of a subject is stored as
// predicate "<detail>_is" (snake_case: wound_location_is, first_name_is, eye_colour_is) with the answer in `value` and no
// object: "Watson · wound_location_is · shoulder". Only the `_is` form is read this way, so free-form predicates
// ("has_daughter", "owns") stay multi-valued and never clash. The value is not an entity: it never files a wiki page.

const DETAIL = /^[a-z0-9]+(?:_[a-z0-9]+)*_is$/
export const isDetailPredicate = (p: string | null | undefined) => !!p && DETAIL.test(p)
// "wound_location_is" -> "wound location"
export const detailName = (p: string) => p.replace(/_is$/, '').replace(/_/g, ' ')

// A detail written with its answer in `object` (as Add fact's third box or a model may send it) is stored with the answer in
// `value`, so it never becomes an entity page. Anything else is returned as it came.
export function asDetail<T extends { predicate: string, object?: string | null, value?: string | null }>(f: T): T {
  return isDetailPredicate(f.predicate) && !f.value?.toString().trim() && f.object?.trim() ? { ...f, value: f.object.trim(), object: null } : f
}

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
