// Entity wiki vocabulary shared by the API and the UI. Everything here is editorial metadata: it never feeds canon,
// conflicts or impact.

export const ENTITY_KINDS = ['character', 'location', 'item', 'faction', 'event', 'other'] as const
export type EntityKind = typeof ENTITY_KINDS[number]
export const KIND_LABEL: Record<EntityKind, { one: string, many: string }> = {
  character: { one: 'Character', many: 'Characters' },
  location: { one: 'Location', many: 'Locations' },
  item: { one: 'Item', many: 'Items' },
  faction: { one: 'Faction', many: 'Factions' },
  event: { one: 'Event', many: 'Events' },
  other: { one: 'Other', many: 'Other' },
}

// Project medium decides which extra fields each kind shows. Values are stored by key, so switching medium hides fields
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
}

export const MEDIA = {
  game: {
    label: 'Game',
    fields: {
      character: ['role', 'player_hook', 'voice'], location: ['region', 'access', 'gameplay'], item: ['item_type', 'found', 'gameplay'],
      faction: ['goal', 'leader', 'stance'], event: ['questline', 'trigger', 'outcome'], other: [],
    },
  },
  prose: {
    label: 'Novel or prose',
    fields: {
      character: ['role', 'want', 'voice'], location: ['region', 'mood'], item: ['significance'],
      faction: ['goal', 'leader'], event: ['chapter', 'stakes'], other: [],
    },
  },
  screen: {
    label: 'Film or series',
    fields: {
      character: ['role', 'arc', 'casting'], location: ['region', 'look'], item: ['significance'],
      faction: ['goal', 'leader'], event: ['episode', 'stakes'], other: [],
    },
  },
} satisfies Record<string, { label: string, fields: Record<EntityKind, string[]> }>
export type Medium = keyof typeof MEDIA
export const mediumOf = (v: unknown): Medium => (typeof v === 'string' && v in MEDIA ? v as Medium : 'game')

// Whole-word, case-insensitive matcher for a set of names; longest first so "Leya Venn" wins over "Leya".
export function mentionPattern(names: Iterable<string>) {
  const list = [...new Set([...names].map(n => n.trim()).filter(n => n.length > 1))].sort((a, b) => b.length - a.length)
  if (!list.length) return null
  const alt = list.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|')
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'giu')
}

export const normName = (s: string | null | undefined) => s?.trim().replace(/\s+/g, ' ').toLowerCase() || ''
