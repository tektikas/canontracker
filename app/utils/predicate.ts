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

// Relations offered when a person adds a fact by hand, in the words a writer would use. The first four are the ones conflict
// checks read, so their plain wording maps back to the stored predicate (`relationFor`); anything else is stored as typed.
export const PREDICATES: { value: string, label: string, words: string[], hint: string }[] = [
  { value: 'located_at', label: 'is at', words: ['is in', 'was at', 'was in', 'at', 'in', 'located at', 'is located at'], hint: 'Where someone is at a story time. Checked for being in two places at once.' },
  { value: 'travel_time', label: 'is minutes away from', words: ['travel time to', 'travel time', 'minutes from', 'minutes to'], hint: 'Minutes to get from one place to another. Checked against movements.' },
  { value: 'sibling_of', label: 'is the sibling of', words: ['sibling of', 'is the brother of', 'is the sister of', 'brother of', 'sister of'], hint: 'A family tie.' },
  { value: 'engaged_to', label: 'is engaged to', words: ['engaged to'], hint: 'A relationship that can end. Checked for use after it ended.' },
  { value: 'rule', label: 'has a rule', words: ['rule', 'follows the rule'], hint: 'A rule of the world. Checked against what characters do.' },
  { value: 'is', label: 'is', words: ['is a', 'is an', 'is the'], hint: 'Who or what someone is.' },
  { value: 'member_of', label: 'is a member of', words: ['member of', 'belongs to'], hint: 'Belongs to a group or faction.' },
  { value: 'owns', label: 'owns', words: [], hint: 'Has or carries something.' },
  { value: 'kept_in', label: 'is kept in', words: ['kept in'], hint: 'Where an item is kept.' },
]
const plain = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, ' ')
// "is at" -> "located_at". Typed words that aren't a known relation are kept ("works at" -> "works_at").
export function relationFor(text: string) {
  const t = plain(text)
  const known = PREDICATES.find(p => [p.value, p.label, ...p.words].some(w => plain(w) === t))
  return known?.value ?? t.replace(/ /g, '_')
}

// Story time as a writer types or writes it ("Day 1 20:30", "20:30 on Day 1", "d1 9:05") -> "D1 20:30", the form the API
// takes. Null when there is no day or no clock time in it.
const DAY = /\b(?:d|day)\s*(\d+)\b/i
const CLOCK = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g
const label = (day: string, h: string, m: string) => `D${Number(day)} ${h.padStart(2, '0')}:${m}`
export function storyTime(text: string) {
  const day = text.match(DAY)?.[1]
  const clock = [...text.matchAll(CLOCK)]
  return day && clock.length === 1 ? label(day, clock[0]![1]!, clock[0]![2]!) : null
}
// The times a sentence states: "from 20:00 to 21:00 on Day 1" -> D1 20:00 / D1 21:00. One day per sentence.
export function timesIn(text: string) {
  const day = text.match(DAY)?.[1]
  const [a, b] = [...text.matchAll(CLOCK)]
  return { from: day && a ? label(day, a[1]!, a[2]!) : '', to: day && b ? label(day, b[1]!, b[2]!) : '' }
}

// The fact's kind from its predicate. Kind feeds the relationship and world-rule checks; the writer never picks it.
export function kindForPredicate(p: string) {
  if (p === 'located_at') return 'event'
  if (p === 'travel_time' || p === 'rule') return 'rule'
  if (p === 'is') return 'character'
  if (/_(of|to|with)$/.test(p)) return 'relationship'
  return 'claim'
}

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
