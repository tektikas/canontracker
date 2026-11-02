import type { IconName } from '~/components/ui/Icon.vue'

// Document kinds as the Library shows them. Kept in step with DOCUMENT_KINDS in server/utils/importer.ts.
export const DOC_KINDS: { value: string, label: string, icon: IconName }[] = [
  { value: 'scene', label: 'Scene', icon: 'scene' },
  { value: 'lore', label: 'Lore', icon: 'canon' },
  { value: 'character', label: 'Character', icon: 'character' },
  { value: 'location', label: 'Location', icon: 'location' },
  { value: 'quest', label: 'Quest', icon: 'quest' },
  { value: 'dialogue', label: 'Dialogue', icon: 'dialogue' },
  { value: 'other', label: 'Other', icon: 'file' },
]
export const docKind = (k: string) => DOC_KINDS.find(x => x.value === k) ?? { value: k, label: k, icon: 'file' as IconName }

// Tag colours are design-token tones (DESIGN.md); the names are what a person picks from.
export const TAG_TONES: { value: 'accent' | 'good' | 'warn' | 'bad' | 'pencil', label: string }[] = [
  { value: 'accent', label: 'Ink' }, { value: 'good', label: 'Moss' }, { value: 'warn', label: 'Ochre' },
  { value: 'bad', label: 'Vermilion' }, { value: 'pencil', label: 'Graphite' },
]
export type TagTone = typeof TAG_TONES[number]['value']

// Same limits the server applies (server/api/documents/index.post.ts), checked first so a person hears at once.
export const UPLOAD_MAX_BYTES = 1_000_000
export function uploadProblem(f: File) {
  const bad = uploadNameProblem(f.name)
  if (bad) return bad
  if (f.size > UPLOAD_MAX_BYTES) return `Too big: ${(f.size / 1e6).toFixed(1)} MB, the limit is 1 MB per file.`
  if (!f.size) return 'Empty file.'
  return null
}

/** Why a canon quote is outdated in version `v` of its source: gone (count 0) or no longer in one place (count 2+). */
export const quoteLost = (count: number, v: number) =>
  count === 0 ? `Quote not in v${v}` : `Quote appears ${count === 2 ? 'twice' : `${count} times`} in v${v}`
