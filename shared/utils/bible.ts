// Story bible export and share links: what can be included, shared by the API (which builds it) and the UI (which asks for it).
// A bible holds only accepted canon (and sample canon, marked) with its citations. Editorial wiki text is opt-in and labelled.

export const BIBLE_SECTIONS = {
  overview: { label: 'Overview', hint: 'Title, scope and what the bible contains' },
  entities: { label: 'Characters, places and things', hint: 'One card per page, with portrait and aliases' },
  facts: { label: 'Canon by entity', hint: 'Every accepted fact with its source quote' },
  timeline: { label: 'Timeline', hint: 'Timed canon in story order' },
  rules: { label: 'World rules', hint: 'Rules of the world, with sources' },
  conflicts: { label: 'Open conflicts', hint: 'Flagged clashes nobody has judged yet' },
  sources: { label: 'Sources appendix', hint: 'Every cited document, version and line' },
  editorial: { label: 'Editorial notes', hint: 'Wiki summaries, fields and notes, marked as not canon' },
} as const
export type BibleSection = keyof typeof BIBLE_SECTIONS
export const SECTION_KEYS = Object.keys(BIBLE_SECTIONS) as BibleSection[]
export const DEFAULT_SECTIONS: BibleSection[] = ['overview', 'entities', 'facts', 'timeline', 'rules', 'sources']

export type BibleScope = 'project' | 'entities' | 'folder'
export interface BibleOptions { scope: BibleScope, entity_ids: string[], folder_id: string | null, sections: BibleSection[], images: boolean }

// Share link lifetimes the UI offers (days; null = never expires).
export const SHARE_EXPIRY = [{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: null, label: 'Never' }] as const

export const CONFLICT_RULE_LABEL: Record<string, string> = {
  EXACT_TIME_LOCATION_OVERLAP: 'Same person, two places, overlapping exact times',
  APPROX_TIME_LOCATION_OVERLAP: 'Same person, two places, overlapping approximate times',
  RELATIONSHIP_AFTER_END: 'Relationship used after it ended',
  TRAVEL_TIME_TOO_SHORT: 'Not enough time to travel between places',
  ATTRIBUTE_MISMATCH: 'Same detail, two answers',
  WORLD_RULE_VIOLATION: 'Fact breaks a world rule',
}

// The bible as the API returns it. A whitelist: no user names, ids of facts, documents or audit rows, notes or candidates.
export interface BibleCitation {
  quote: string, document: string, file: string, folder: string | null, version: number, latest_version: number
  line_from: number | null, line_to: number | null, prior_source: boolean
}
export interface BibleFact {
  n: string, kind: string, statement: string, subject: string, predicate: string, object: string | null
  time_label: string | null, approximate: boolean, t_from: number | null, version: number, sample: boolean
  entity: string | null, citations: BibleCitation[]
}
export interface BibleEntity {
  // facts: given in full under this entity in "Canon by entity"; named_in: facts given under another entity that also name it.
  key: string, name: string, kind: string, aliases: string[], portrait: string | null, facts: string[], named_in: string[]
  editorial: { summary: string, fields: { label: string, value: string }[], notes: string } | null
}
export interface Bible {
  title: string, studio: string, medium: string, generated_at: string
  scope: { kind: BibleScope, label: string }, sections: BibleSection[], images: boolean
  counts: { facts: number, entities: number, documents: number, sample: number, stale: number }
  types: EntityType[], entities: BibleEntity[], facts: BibleFact[], other_facts: string[]
  // Book exports only: applied cover image of the first document that has one.
  cover?: string | null
  rules: string[], timeline: string[]
  conflicts: { rule: string, model: boolean, rationale: string, facts: string[] }[]
  sources: { document: string, file: string, folder: string | null, kind: string, version: number, latest_version: number, sha256: string, citations: { fact: string, line_from: number | null, line_to: number | null, quote: string }[] }[]
}

// "Scene S01 (Harbor / S01.md), v1, line 3"
export const citeLine = (c: BibleCitation) => [`${c.document} (${[c.folder, c.file].filter(Boolean).join(' / ')})`, `v${c.version}`, lineLabel(c),
  c.prior_source ? 'prior source, wording changed' : '', c.latest_version > c.version ? `stale: source now v${c.latest_version}` : ''].filter(Boolean).join(', ')

// The manuscript: the project's source documents, latest versions only, in reading order (folder, then title with numbers in order).
export type BibleBook = 'bible' | 'manuscript'
// The manuscript's order, also the timeline's Reading order: folder path (root first), then title with numbers in order (S2 before S10).
// Two parts of one manuscript split on upload ("dracula-ch-007.md", "stream-part-002.md", shared/utils/manuscript.ts) go by their
// position instead, so "Chapter Two" stays after "Chapter One" and the front matter (ch-000) first.
const splitPart = (d: { filename?: string, key?: string }) => (d.filename ?? d.key)?.match(/(?:^|\/)([a-z0-9-]+)-(?:ch|part)-(\d{3})\.md$/)
export const byReadingOrder = (a: { folder: string | null, title: string, filename?: string, key?: string }, b: { folder: string | null, title: string, filename?: string, key?: string }) => {
  const byFolder = (a.folder ?? '').localeCompare(b.folder ?? '', 'en', { numeric: true })
  if (byFolder) return byFolder
  const pa = splitPart(a), pb = splitPart(b)
  if (pa && pb && pa[1] === pb[1]) return Number(pa[2]) - Number(pb[2])
  return a.title.localeCompare(b.title, 'en', { numeric: true })
}
// Books in order: a folder comes where its first document's file name sorts ("1900-the-wonderful-wizard…" before "1904-…",
// "chapter-01" before "chapter-02"), not by the folder's own name; inside a folder, byReadingOrder. ranks: folder → first file name.
type Ordered = { folder: string | null, title: string, key?: string, filename?: string }
export function folderRanks(docs: Ordered[]) {
  const first = new Map<string, string>()
  for (const d of docs) {
    const f = d.folder ?? '', n = d.filename ?? d.key ?? d.title
    if (!first.has(f) || n.localeCompare(first.get(f)!, 'en', { numeric: true }) < 0) first.set(f, n)
  }
  return first
}
export const readingOrderBy = (ranks: Map<string, string>) => (a: Ordered, b: Ordered) =>
  (ranks.get(a.folder ?? '') ?? '').localeCompare(ranks.get(b.folder ?? '') ?? '', 'en', { numeric: true }) || byReadingOrder(a, b)
export const sortReadingOrder = <T extends Ordered>(docs: T[]) => [...docs].sort(readingOrderBy(folderRanks(docs)))
export interface Manuscript {
  title: string, studio: string, generated_at: string, scope: { kind: BibleScope, label: string }, cover: string | null
  counts: { documents: number, words: number }
  chapters: { key: string, title: string, folder: string | null, kind: string, version: number, text: string }[]
}

export const lineLabel = (c: { line_from: number | null, line_to: number | null }) =>
  c.line_from == null ? '' : c.line_to != null && c.line_to !== c.line_from ? `lines ${c.line_from}–${c.line_to}` : `line ${c.line_from}`

// Whether a fact is given in full by an entity's canon, other canon or world rules. The timeline and conflicts only refer to facts
// by number, so the rest are given in full in "Facts referenced above".
export const shownElsewhere = (b: Bible, n: string) => b.rules.includes(n) || b.other_facts.includes(n) || b.entities.some(e => e.facts.includes(n))
