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
// The times a sentence states: "from 20:00 to 21:00 on Day 1" -> D1 20:00 / D1 21:00. Each clock takes the day written next to
// it ("08:00 on Day 1", "Day 2 09:00"); a clock without one takes the sentence's only day, or nothing when there are several.
export function timesIn(text: string) {
  const days = [...text.matchAll(new RegExp(DAY, 'gi'))]
  const at = (m: RegExpMatchArray) => {
    const own = text.slice(0, m.index).match(/\b(?:d|day)\s*(\d+)\s*,?\s*(?:at\s+)?$/i)?.[1]
      ?? text.slice(m.index! + m[0].length).match(/^\s*(?:on\s+)?(?:d|day)\s*(\d+)\b/i)?.[1]
    const day = own ?? (days.length === 1 ? days[0]![1] : undefined)
    return day ? label(day, m[1]!, m[2]!) : ''
  }
  const [a, b] = [...text.matchAll(CLOCK)]
  return { from: a ? at(a) : '', to: b ? at(b) : '' }
}

// What a sentence suggests for who / does what / where / when. `known` = the known names it mentions, in order, with their page
// kind. Only guesses: the dialog shows them before anything goes to canon. Who is a known character or faction, else the first
// capitalised name that isn't a known page; a known location is the place. "is at" only for presence wording (waits, stays, is in,
// arrives at), never for movement (walks to, leaves): a wrong "is at" is a false conflict.
const PRESENCE = /\b(?:(?:is|was|are|were|works?|worked|working|lives?|lived|arrives?|arrived|arriving|meets?|met)\s+(?:still\s+|already\s+)?(?:at|in|inside)|stays?|stayed|staying|waits?|waited|waiting|stands?|stood|standing|sits?|sat|sitting|hides?|hid|hiding|remains?|remained|sleeps?|slept)\b/i
const MOTION = /\b(?:(?:walk|head|sail|travel|return|depart|climb|row|march|wander|cross|rush|hurr(?:y|ie))(?:s|ed|ing)?|go|goes|going|gone|went|run|runs|running|ran|ride|rides|riding|rode|drive|drives|driving|drove|move|moves|moved|moving|come|comes|coming|came|leave|leaves|leaving|left|fly|flies|flying|flew|set(?:s|ting)? (?:out|off)|towards?|into)\b/i
export function suggestParts(text: string, known: { name: string, kind?: string }[]) {
  const subject = known.find(n => n.kind === 'character' || n.kind === 'faction')?.name ?? firstName(text, known.map(n => n.name))
  const place = known.find(n => n.kind === 'location' && n.name.toLowerCase() !== subject.toLowerCase())
  const time = timesIn(text)
  const at = !!(place && time.from && PRESENCE.test(text) && !MOTION.test(text))
  return { subject, relation: at ? 'is at' : '', object: at ? place!.name : '', time_from: time.from, time_to: time.to }
}
// "At the Harbor, Leya waits" -> "Leya": a run of capitalised words, not a function word, not right after "the" / "at" / "to"
// (those are places or things) unless the sentence opens with it ("The Glassworks hires Tom").
const NOT_NAMES = new Set('a an the at on in to from until by when then after before during as and but or if while day this that there here he she they it we i you his her their its'.split(' '))
const LEADS = new Set('a an the at on in into to toward towards from near by of'.split(' '))
const isName = (t?: string) => !!t && /^\p{Lu}\p{Ll}/u.test(t) && !NOT_NAMES.has(t.toLowerCase())
function firstName(text: string, skip: string[]) {
  const no = new Set(skip.map(s => s.trim().toLowerCase()))
  const tokens = (text.match(/[\p{L}\p{N}'’-]+|[^\s\p{L}\p{N}]/gu) ?? []).map(t => t.replace(/['’]s$/, ''))
  for (let i = 0; i < tokens.length; i++) {
    const prev = tokens[i - 1] ?? ''
    if (!isName(tokens[i]) || (LEADS.has(prev.toLowerCase()) && !(i === 1 && /^(The|A|An)$/.test(prev)))) continue
    let j = i
    while (isName(tokens[j + 1])) j++
    const name = tokens.slice(i, j + 1).join(' ')
    if (!no.has(name.toLowerCase())) return name
    i = j
  }
  return ''
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
