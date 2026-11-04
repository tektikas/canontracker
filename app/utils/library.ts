import type { IconName } from '~/components/ui/Icon.vue'

// Document kinds as the Library shows them. Kept in step with DOCUMENT_KINDS in server/utils/importer.ts.
export const DOC_KINDS: { value: string, label: string, icon: IconName }[] = [
  { value: 'scene', label: 'Scene', icon: 'scene' },
  { value: 'lore', label: 'Lore', icon: 'canon' },
  { value: 'character', label: 'Character', icon: 'character' },
  { value: 'location', label: 'Location', icon: 'location' },
  { value: 'quest', label: 'Quest', icon: 'quest' },
  { value: 'dialogue', label: 'Dialogue', icon: 'dialogue' },
  { value: 'recording', label: 'Recording', icon: 'mic' },
  { value: 'other', label: 'Other', icon: 'file' },
]
// Kind 'scene' is the story's own text: shown as "Chapter" in a prose project, "Scene" in a game or screen project.
export const docKind = (k: string, medium?: string | null) => {
  const d = DOC_KINDS.find(x => x.value === k) ?? { value: k, label: k, icon: 'file' as IconName }
  return k === 'scene' && medium === 'prose' ? { ...d, label: 'Chapter' } : d
}
export const docKinds = (medium?: string | null) => DOC_KINDS.map(k => docKind(k.value, medium))
/** The current project's labels: docKind(k) and the word for its story text ("chapter" / "scene", one and many). */
export function useDocKinds() {
  const me = useMe()
  const medium = computed(() => me.value?.current?.project.medium)
  const prose = computed(() => medium.value === 'prose')
  return {
    docKind: (k: string) => docKind(k, medium.value),
    kinds: computed(() => docKinds(medium.value)),
    scene: computed(() => (prose.value ? { one: 'chapter', many: 'chapters', One: 'Chapter', Many: 'Chapters' } : { one: 'scene', many: 'scenes', One: 'Scene', Many: 'Scenes' })),
  }
}

// Tag colours are design-token tones (DESIGN.md); the names are what a person picks from.
export const TAG_TONES: { value: 'accent' | 'good' | 'warn' | 'bad' | 'pencil', label: string }[] = [
  { value: 'accent', label: 'Ink' }, { value: 'good', label: 'Moss' }, { value: 'warn', label: 'Ochre' },
  { value: 'bad', label: 'Vermilion' }, { value: 'pencil', label: 'Graphite' },
]
export type TagTone = typeof TAG_TONES[number]['value']

// "Keep as one document": the uploader sends a whole book as one document instead of splitting it into chapters. Per tab.
export const useKeepWhole = () => useState('upload-keep-whole', () => false)

// Same limits the server applies (server/api/documents/index.post.ts), checked first so a person hears at once.
export const UPLOAD_MAX_BYTES = 1_000_000
// Audio becomes a recording: transcribed, and the transcript is the document (server/api/recordings). Same list as the server.
export const AUDIO_UPLOAD = /\.(wav|mp3|m4a|ogg|oga|opus|webm|flac|aac)$/i
export const AUDIO_MAX_BYTES = 64 * 1024 * 1024
export function uploadProblem(f: File) {
  if (AUDIO_UPLOAD.test(f.name)) return f.size > AUDIO_MAX_BYTES ? `Too big: ${(f.size / 1e6).toFixed(1)} MB, recordings can be up to 64 MB.` : f.size ? null : 'Empty file.'
  const bad = uploadNameProblem(f.name, 'Not a text, Word or audio file: use .md, .txt, .docx, or MP3, WAV, M4A, OGG, WebM or FLAC audio.')
  if (bad) return bad
  if (f.size > UPLOAD_MAX_BYTES) return `Too big: ${(f.size / 1e6).toFixed(1)} MB, the limit is 1 MB per file.`
  if (!f.size) return 'Empty file.'
  return null
}

/** Why a canon quote is outdated in version `v` of its source: gone (count 0) or no longer in one place (count 2+). */
export const quoteLost = (count: number, v: number) =>
  count === 0 ? `Quote not in v${v}` : `Quote appears ${count === 2 ? 'twice' : `${count} times`} in v${v}`
