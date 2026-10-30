// "uses_on_arin" -> "uses on Arin": underscores to spaces, words that match a known entity keep the entity's casing.
export function humanizePredicate(predicate: string, entities: Iterable<string> = []): string {
  const names = new Map<string, string>()
  for (const e of entities) names.set(e.toLowerCase(), e)
  return predicate.split('_').map(w => names.get(w.toLowerCase()) ?? w).join(' ')
}

// "uses_on_arin" + object "Chord Stone" -> "uses Chord Stone on Arin": a trailing "<preposition> <entity>" wraps the object.
export function factPhrase(f: Record<string, any>, entities: Iterable<string> = []): string {
  const words = humanizePredicate(f.predicate, entities).split(' ')
  const PREP = new Set(['on', 'at', 'to', 'for', 'with', 'by', 'from'])
  if (f.object && words.length >= 3 && PREP.has(words.at(-2)!)) {
    return [...words.slice(0, -2), f.object, ...words.slice(-2)].join(' ')
  }
  return [words.join(' '), f.object].filter(Boolean).join(' ')
}

// Predicates offered when a person adds a fact by hand. The first four are the ones conflict checks read.
export const PREDICATES: { value: string, hint: string }[] = [
  { value: 'located_at', hint: 'Where someone is at a story time. Checked for being in two places at once.' },
  { value: 'travel_time', hint: 'Minutes to get from one place to another. Checked against movements.' },
  { value: 'sibling_of', hint: 'A family tie.' },
  { value: 'engaged_to', hint: 'A relationship that can end. Checked for use after it ended.' },
  { value: 'rule', hint: 'A rule of the world. Checked against what characters do.' },
  { value: 'is', hint: 'Who or what someone is.' },
  { value: 'member_of', hint: 'Belongs to a group or faction.' },
  { value: 'owns', hint: 'Has or carries something.' },
  { value: 'kept_in', hint: 'Where an item is kept.' },
]

// A first guess at the fact's kind from its predicate; the person can change it.
export function kindForPredicate(p: string) {
  if (p === 'located_at') return 'event'
  if (p === 'travel_time' || p === 'rule') return 'rule'
  if (p === 'is') return 'character'
  if (/_(of|to|with)$/.test(p)) return 'relationship'
  return 'claim'
}

// "Arin" + located_at + "Harbor" + "D2 14:00" -> "Arin is at Harbor at D2 14:00." A draft the person edits.
// "Lighthouse" -> "the Lighthouse", "Old Docks" -> "the Old Docks": a place named by a common noun gets an article.
// Names ("Saltmarsh", "Lantern Coast") stay as typed. A short list on purpose; the statement is editable anyway.
const PLACE_NOUNS = new Set(('lighthouse harbor harbour docks dock pier port market square tavern inn temple shrine chapel church castle keep tower '
  + 'palace hall gate bridge mill village town city forest woods cave cliffs beach shore coast island ship boat library archive vault cellar '
  + 'kitchen garden courtyard station camp barracks prison mine quarry well').split(' '))
export function placePhrase(name: string) {
  const n = name.trim()
  if (!n || /^(the|a|an)\s/i.test(n)) return n
  return PLACE_NOUNS.has(n.split(/\s+/).at(-1)!.toLowerCase()) ? `the ${n}` : n
}

export function draftStatement(f: { subject: string, predicate: string, object?: string, value?: string, time_from?: string, time_to?: string }) {
  if (!f.subject.trim() || !f.predicate.trim()) return ''
  const p = f.predicate.trim().toLowerCase().replace(/\s+/g, '_')
  const what = p === 'located_at' ? `is at ${placePhrase(f.object ?? '') || '…'}`
    : p === 'travel_time' ? `to ${placePhrase(f.object ?? '') || '…'} takes ${f.value || '…'} minutes`
    : p === 'is' ? `is ${f.object || '…'}`
    : factPhrase({ predicate: p, object: f.object || null })
  const when = f.time_from && f.time_to ? ` from ${f.time_from} to ${f.time_to}` : f.time_from ? ` at ${f.time_from}` : f.time_to ? ` until ${f.time_to}` : ''
  const s = `${p === 'travel_time' ? 'The way from ' : ''}${f.subject.trim()} ${what}${when}`
  return `${s[0]!.toUpperCase()}${s.slice(1)}.`
}
