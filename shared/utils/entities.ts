// Entity wiki vocabulary shared by the API and the UI. Everything here is editorial metadata: it never feeds canon,
// conflicts or impact.

// Entity types are per project (table entity_types): a new project starts from its medium's defaults and the team renames,
// adds, recolours or removes them in Settings → Projects. A type's key is fixed when it is made; renaming changes only labels,
// so pages keep their type. Kind guessing and a few presentation heuristics know the built-in keys (character, location,
// item, faction); they still apply after a rename and simply never fire for keys a project doesn't have.
export const TYPE_COLORS = { neutral: 'Plain', accent: 'Ink', good: 'Moss', warn: 'Ochre', bad: 'Vermilion', pencil: 'Graphite' } as const
export type TypeColor = keyof typeof TYPE_COLORS
// Icons a type may use (names from app/components/ui/Icon.vue).
export const TYPE_ICONS = ['character', 'npc', 'team', 'location', 'item', 'ability', 'quest', 'faction', 'event', 'scene', 'dialogue', 'image', 'note', 'lock', 'other'] as const
export type TypeIcon = typeof TYPE_ICONS[number]
export interface EntityType { key: string, one: string, many: string, color: TypeColor, icon: TypeIcon }

export const DEFAULT_TYPES: Record<string, EntityType> = Object.fromEntries(([
  ['character', 'Character', 'Characters', 'accent', 'character'],
  ['npc', 'NPC', 'NPCs', 'accent', 'npc'],
  ['location', 'Location', 'Locations', 'good', 'location'],
  ['item', 'Item', 'Items', 'warn', 'item'],
  ['ability', 'Ability', 'Abilities', 'warn', 'ability'],
  ['quest', 'Quest', 'Quests', 'pencil', 'quest'],
  ['faction', 'Faction', 'Factions', 'bad', 'faction'],
  ['event', 'Event', 'Events', 'pencil', 'event'],
  ['other', 'Other', 'Other', 'neutral', 'other'],
] as const).map(([key, one, many, color, icon]) => [key, { key, one, many, color, icon }]))

// "Ability" → "Abilities", "Class" → "Classes". A suggestion; the plural is stored and editable.
export const pluralOf = (one: string) => /[^aeiou]y$/i.test(one) ? `${one.slice(0, -1)}ies` : /(s|x|z|ch|sh)$/i.test(one) ? `${one}es` : `${one}s`
// A key the project has no type for (removed since, or seen outside the app) still reads sensibly.
export function typeOf(types: readonly EntityType[], key: string): EntityType {
  const one = key.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase())
  return types.find(t => t.key === key) ?? DEFAULT_TYPES[key] ?? { key, one, many: pluralOf(one), color: 'neutral', icon: 'other' }
}

// A type name inside a sentence keeps the team's casing: "Character" → "character", but "NPC" and "Voice Actor" stay.
export const typeWord = (w: string) => /^\p{Lu}[\p{Ll}\s]*$/u.test(w) ? w.toLowerCase() : w
// "a" or "an" by sound, letter-named acronyms included: "an item", "an NPC", "a quest".
export const withArticle = (w: string) => `${/^[aeiou]/i.test(w) || /^[AEFHILMNORSX](?:[A-Z\d]|$)/.test(w) ? 'an' : 'a'} ${w}`

// Project medium decides which extra fields each built-in type shows (a type the team made has none; summary and notes cover it), and
// which types a new project starts with. Values are stored by key, so switching medium hides fields
// without losing what was typed.
export const FIELD_LABEL: Record<string, { label: string, hint: string }> = {
  role: { label: 'Role', hint: 'Protagonist, companion, quest giver…' },
  player_hook: { label: 'Player hook', hint: 'Why the player cares or engages' },
  voice: { label: 'Voice and tone', hint: 'How they talk; notes for writers and VO' },
  want: { label: 'Want', hint: 'What they are after' },
  arc: { label: 'Arc', hint: 'How they change' },
  casting: { label: 'Casting note', hint: 'Age, look, casting direction' },
  region: { label: 'Region', hint: 'Where it sits in the world' },
  access: { label: 'Access', hint: 'How and when the player can get there' },
  gameplay: { label: 'Gameplay', hint: 'What the player does here or with it' },
  mood: { label: 'Mood', hint: 'What it feels like to be there' },
  look: { label: 'Look', hint: 'Set dressing, light, palette' },
  item_type: { label: 'Type', hint: 'Weapon, key item, collectible…' },
  found: { label: 'Where found', hint: 'How the player gets it' },
  significance: { label: 'Significance', hint: 'Why it matters to the story' },
  goal: { label: 'Goal', hint: 'What the faction wants' },
  leader: { label: 'Leader', hint: 'Who runs it' },
  stance: { label: 'Stance to player', hint: 'Ally, hostile, neutral, changes with choices…' },
  questline: { label: 'Quest or questline', hint: 'Which quest this belongs to' },
  trigger: { label: 'Trigger', hint: 'What starts it' },
  outcome: { label: 'Outcome', hint: 'What changes afterwards' },
  chapter: { label: 'Chapter', hint: 'Where it happens in the book' },
  episode: { label: 'Episode', hint: 'Where it happens in the series' },
  stakes: { label: 'Stakes', hint: 'What can be lost' },
  schedule: { label: 'Schedule', hint: 'Where they are and when' },
}

export const MEDIA = {
  game: {
    label: 'Game',
    fields: {
      character: ['role', 'player_hook', 'voice'], npc: ['role', 'schedule', 'voice'], location: ['region', 'access', 'gameplay'],
      item: ['item_type', 'found', 'gameplay'], ability: ['gameplay', 'found'], quest: ['questline', 'trigger', 'outcome'],
      faction: ['goal', 'leader', 'stance'], event: ['questline', 'trigger', 'outcome'], other: [],
    },
    types: ['character', 'npc', 'location', 'item', 'ability', 'quest', 'faction', 'event', 'other'],
  },
  prose: {
    label: 'Novel or prose',
    fields: {
      character: ['role', 'want', 'voice'], location: ['region', 'mood'], item: ['significance'],
      faction: ['goal', 'leader'], event: ['chapter', 'stakes'], other: [],
    },
    types: ['character', 'location', 'item', 'faction', 'event', 'other'],
  },
  screen: {
    label: 'Film or series',
    fields: {
      character: ['role', 'arc', 'casting'], location: ['region', 'look'], item: ['significance'],
      faction: ['goal', 'leader'], event: ['episode', 'stakes'], other: [],
    },
    types: ['character', 'location', 'item', 'faction', 'event', 'other'],
  },
} satisfies Record<string, { label: string, fields: Record<string, string[]>, types: string[] }>
export type Medium = keyof typeof MEDIA
export const mediumOf = (v: unknown): Medium => (typeof v === 'string' && Object.hasOwn(MEDIA, v) ? v as Medium : 'game')
// The preset fields for a type in a medium; none for a type the team made.
export const fieldsFor = (medium: Medium, kind: string): string[] => (MEDIA[medium].fields as Record<string, string[]>)[kind] ?? []

// Whole-word, case-insensitive matcher for a set of names; longest first so "Leya Venn" wins over "Leya".
export function mentionPattern(names: Iterable<string>) {
  const list = [...new Set([...names].map(n => n.trim()).filter(n => n.length > 1))].sort((a, b) => b.length - a.length)
  if (!list.length) return null
  const alt = list.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|')
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'giu')
}

export const normName = (s: string | null | undefined) => s?.trim().replace(/\s+/g, ' ').toLowerCase() || ''

// Muse Voice Transcribe answers 400 "ASR keyword N exceeds the maximum length of 30 characters" for any longer keyword (seen
// live on 3 Nov 2026; its docs give no limit). The count limit is unknown; 100 is what we send.
export const KEYWORD_MAX_CHARS = 30
/** Recognition hints from the project's pages (title, aliases, analysis and merged names each): the most-cited pages first
 * (canon facts naming them, ties by title), only names that fit Muse's keyword limit, so a page with a long title still
 * helps through a short alias; deduped ignoring case, at most `max`. */
export function transcriptionHints(pages: { title: string, names: string[], facts: number }[], max = 100) {
  const out = new Map<string, string>()
  const ranked = [...pages].sort((a, b) => b.facts - a.facts || a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }))
  for (const raw of ranked.flatMap(p => p.names)) {
    const n = raw.trim().replace(/\s+/g, ' ')
    if (out.size >= max) break
    if (n && n.length <= KEYWORD_MAX_CHARS && !out.has(normName(n))) out.set(normName(n), n)
  }
  return [...out.values()]
}

// A name worth a page: every word starts with a capital (or is a short joining word, or comes from a script without case),
// and the first one is not a joining word, except a leading article. "Sherlock Holmes", "Bell Gate", "the Cinder Key", "Saint-Lô"
// qualify; "poisons", "his finger", "Sherlock Holmes’ test", "rooms with Watson" don't. ponytail: a casing heuristic for
// languages that capitalise names; a typed name list from extraction would replace it.
const JOIN = /^(of|the|de|del|della|da|di|du|des|la|le|les|van|von|der|den|al|el|bin|ibn|y|in|on|at|upon)$/i
export function nameLike(name: string) {
  const words = name.trim().replace(/^(the|a|an)\s+/i, '').split(/\s+/).filter(Boolean)
  if (!words.length || words.length > 6 || JOIN.test(words[0]!)) return false
  return words.every(w => JOIN.test(w) || !/^\p{Ll}/u.test(w))
}
// How stories refer to someone not named yet: a name-shaped owner and one word, "Watson's wife", "Madame Charpentier's son".
// Counts as a name only for a character (a thing would be "Sherlock Holmes’ test").
export function personRef(name: string) {
  const m = name.trim().match(/^(.+?)['’]s?\s+\p{Ll}[\p{L}-]*$/u)
  return !!m && nameLike(m[1]!)
}
