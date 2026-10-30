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
  if (!/\.(md|markdown|txt)$/i.test(f.name)) return 'Not a text file: use .md or .txt.'
  if (f.size > UPLOAD_MAX_BYTES) return `Too big: ${(f.size / 1e6).toFixed(1)} MB, the limit is 1 MB per file.`
  if (!f.size) return 'Empty file.'
  return null
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
