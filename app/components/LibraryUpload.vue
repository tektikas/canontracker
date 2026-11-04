<script setup lang="ts">
// Drop files anywhere on the page (or pick them) to add them to the Library. One request per file, in order, so each row
// shows its own progress and result; one bad file never stops the others. Editors only: the parent leaves it out for viewers.
// `folder`: where the files land (null: the Library root). A file is a new version of the document with its exact name in that
// folder, and only there: a file with the same name elsewhere stays a separate document.
// Each request asks for background extraction: the file is stored and answered at once, and the row then follows the AI
// reading it (ExtractionStatus, polled while it runs), so a long chapter never holds a request open.
// A whole book in one file comes back split into chapters (server: importManuscript): one row for the book ("Dracula.txt →
// 27 chapters in the folder Dracula", "12 of 27 read") with each chapter's status folded under it. "Keep as one document"
// (useKeepWhole, a checkbox in the Library header and in this panel) sends keep_whole=1 instead.
const props = defineProps<{ folder?: { id: string, label: string } | null }>()
const emit = defineEmits<{ uploaded: [] }>()
const keepWhole = useKeepWhole()

type Result = { status: string, filename?: string, duration_ms?: number, document_id?: string, version?: number, folder?: string | null, same_name_in?: { folder: string | null } | null, passages?: number, candidates?: number, skipped?: number, stale_facts?: number, outdated_facts?: number, evidence_moved?: number, word_notes?: number, extraction_error?: string | null, extraction?: { status: string, queued_at: string }, title?: string, same_as?: { filename: string, title: string, version: number }, error?: string }
// A split book: its folder, counts and one result per chapter (front matter included).
type BookResult = Result & { book?: string, chapters?: number, added?: number, versions?: number, unchanged?: number, failed?: number, dropped?: string[], parts?: Result[] }
interface Item {
  key: number, name: string, size: number, state: 'queued' | 'uploading' | 'done' | 'error', error?: string
  audio?: boolean
  result?: BookResult
}
const items = ref<Item[]>([])
const { byId: runs, track } = useExtractions()
const runOf = (i: Item) => (i.result?.extraction && i.result.document_id ? runs.value.get(i.result.document_id) : undefined)
const partRuns = (i: Item) => (i.result?.parts ?? []).flatMap((p) => { const r = p.extraction && p.document_id ? runs.value.get(p.document_id) : undefined; return r ? [r] : [] })
const bookReading = (i: Item) => partRuns(i).filter(extractionActive).length
// "12 of 27 read": the chapters whose text was new or changed, and how many of them the AI has finished.
const bookRead = (i: Item) => { const r = partRuns(i); return { read: r.filter(x => !extractionActive(x)).length, total: r.length, failed: r.filter(x => x.status === 'failed').length } }
// The bar keeps moving while the AI reads the stored file (or any chapter of a book), and turns red if that run fails.
const barOf = (i: Item) => (extractionActive(runOf(i)) || bookReading(i) ? 'uploading' : runOf(i)?.status === 'failed' || bookRead(i).failed ? 'error' : i.state)
const reading = computed(() => items.value.reduce((n, i) => n + (extractionActive(runOf(i)) ? 1 : 0) + bookReading(i), 0))
const busy = computed(() => items.value.some(i => i.state === 'queued' || i.state === 'uploading'))
let seq = 0

const input = ref<HTMLInputElement>()
const pick = () => input.value?.click()
defineExpose({ pick })

async function add(files: File[]) {
  if (!files.length) return
  const fresh: Item[] = files.map((f) => {
    const problem = uploadProblem(f)
    return { key: ++seq, name: f.name, size: f.size, audio: AUDIO_UPLOAD.test(f.name), state: problem ? 'error' : 'queued', error: problem ?? undefined }
  })
  // Newest batch on top; finished rows from earlier batches stay until cleared.
  items.value = [...fresh, ...items.value]
  const folderId = props.folder?.id ?? null
  pending.push(...fresh.map((it, i) => [it, files[i]!, folderId] as const).filter(([it]) => it.state === 'queued'))
  if (!draining) await drain()
}
const pending: (readonly [Item, File, string | null])[] = []
let draining = false
async function drain() {
  draining = true
  let any = false
  while (pending.length) {
    const [shown, file, folderId] = pending.shift()!
    const it = items.value.find(i => i.key === shown.key)
    if (!it) continue
    it.state = 'uploading'
    const form = new FormData()
    // Audio goes to /api/recordings: transcribed there, and the transcript is the document.
    form.append(it.audio ? 'file' : 'files', file, file.name)
    if (folderId) form.append('folder_id', folderId)
    form.append('background', '1')
    if (keepWhole.value) form.append('keep_whole', '1')
    try {
      const r = (await $fetch<{ results: BookResult[] }>(it.audio ? '/api/recordings' : '/api/documents', { method: 'POST', body: form })).results[0]!
      it.result = r
      if (r.extraction && r.document_id) track(r.document_id, r.extraction, { filename: it.name, title: r.title, version: r.version })
      for (const p of r.parts ?? []) if (p.extraction && p.document_id) track(p.document_id, p.extraction, { filename: p.filename, title: p.title, version: p.version })
      it.state = r.status === 'error' ? 'error' : 'done'
      if (r.status === 'error') it.error = r.error
      if (r.status === 'imported' || (r.status === 'split' && (r.added || r.versions))) any = true
    } catch (e) {
      it.state = 'error'
      it.error = errorMessage(e)
    }
  }
  draining = false
  if (any) emit('uploaded')
}

function onPick(e: Event) {
  const el = e.target as HTMLInputElement
  add([...el.files ?? []])
  el.value = ''
}

// Page-wide drop target. Counting enter/leave keeps the overlay steady while the pointer crosses child elements.
const over = ref(false)
let depth = 0
const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
function onEnter(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  depth++
  over.value = true
}
function onOver(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'copy'
}
function onLeave(e: DragEvent) {
  if (!hasFiles(e)) return
  depth = Math.max(0, depth - 1)
  if (!depth) over.value = false
}
function onDrop(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  depth = 0
  over.value = false
  add([...e.dataTransfer!.files])
}
onMounted(() => {
  window.addEventListener('dragenter', onEnter)
  window.addEventListener('dragover', onOver)
  window.addEventListener('dragleave', onLeave)
  window.addEventListener('drop', onDrop)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onEnter)
  window.removeEventListener('dragover', onOver)
  window.removeEventListener('dragleave', onLeave)
  window.removeEventListener('drop', onDrop)
})

const place = (folder?: string | null) => (folder ? `“${folder}”` : 'the Library root')
const kb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)
const done = computed(() => items.value.filter(i => i.state === 'done' || i.state === 'error').length)
const summary = computed(() => {
  const r = items.value.flatMap(i => i.result?.parts ?? [i.result])
  const added = r.filter(x => x?.status === 'imported' && x.version === 1).length
  const versions = r.filter(x => x?.status === 'imported' && (x.version ?? 1) > 1).length
  const skipped = r.filter(x => x?.status === 'duplicate').length
  const failed = items.value.filter(i => i.state === 'error').length
  return [added && `${added} added`, versions && counted(versions, 'new version'), skipped && `${skipped} unchanged`, failed && `${failed} failed`].filter(Boolean).join(' · ')
})
const candidates = computed(() => items.value.reduce((n, i) => n + (i.result?.candidates ?? runOf(i)?.created ?? 0) + partRuns(i).reduce((m, x) => m + (x.created ?? 0), 0), 0))
// While a batch runs every file shows; afterwards the list folds to the failures, the rest behind "Show all".
const expanded = ref(false)
const rows = computed(() => (busy.value || reading.value || expanded.value ? items.value : items.value.filter(i => i.state === 'error' || runOf(i)?.status === 'failed' || bookRead(i).failed)))
const partState = (p: Result) => (p.status === 'error' ? p.error : p.status === 'duplicate' ? 'Unchanged, skipped' : p.version && p.version > 1 ? `New version v${p.version}` : '')
const clear = () => { items.value = items.value.filter(i => i.state === 'queued' || i.state === 'uploading') }
</script>

<template>
  <input ref="input" type="file" :accept="UPLOAD_ACCEPT" multiple hidden @change="onPick">

  <Teleport to="body">
    <div v-if="over" class="drop-overlay" aria-hidden="true">
      <div class="drop-card">
        <UiIcon name="upload" :size="28" />
        <b>Drop to add {{ folder ? `to ${folder.label}` : 'to the Library' }}</b>
        <span>Markdown, plain text or Word (.docx) up to 1 MB, or audio up to 30 minutes (transcribed into a read-only transcript). A file with the same name as one {{ folder ? `in ${folder.label}` : 'in the Library root' }} becomes its next version.</span>
      </div>
    </div>
  </Teleport>

  <UiPanel v-if="items.length" class="uploads" flush>
    <header class="up-head">
      <div>
        <h2>Uploads</h2>
        <p class="small muted" role="status">{{ busy ? `Uploading ${Math.min(done + 1, items.length)} of ${items.length}…` : [summary, reading && `the AI is reading ${reading === 1 ? '1 document' : `${reading} documents`}`, candidates && `${counted(candidates, 'candidate')} sent to Review`].filter(Boolean).join(' · ') }}</p>
        <p class="small faint">Files are stored read-only, as they are. A whole book is split into one document per chapter. The AI proposes candidates; nothing becomes canon until a person accepts it in Review.</p>
      </div>
      <div class="row">
        <label class="keep small"><input v-model="keepWhole" type="checkbox"> Keep as one document</label>
        <UiButton v-if="candidates && !busy" size="sm" to="/review">Review {{ counted(candidates, 'candidate') }}</UiButton>
        <UiButton v-if="!busy && rows.length < items.length || expanded" size="sm" variant="ghost" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? 'Hide files' : `Show all ${items.length}` }}</UiButton>
        <UiButton v-if="!busy" size="sm" variant="ghost" @click="clear">Clear</UiButton>
      </div>
    </header>
    <ul v-if="rows.length" class="up-list">
      <li v-for="i in rows" :key="i.key" :class="barOf(i)">
        <UiIcon :name="barOf(i) === 'error' ? 'conflicts' : barOf(i) === 'done' ? 'check' : 'file'" :size="16" class="up-icon" />
        <div class="up-main">
          <div class="up-name">
            <NuxtLink v-if="i.result?.document_id && i.result.status !== 'error'" :to="`/documents/${i.result.document_id}`">{{ i.name }}</NuxtLink>
            <span v-else>{{ i.name }}</span>
            <span class="faint small">{{ kb(i.size) }}</span>
          </div>
          <div class="bar" :class="barOf(i)" role="progressbar" :aria-label="`${i.name}: ${barOf(i)}`" :aria-busy="barOf(i) === 'uploading' || undefined"><span /></div>
          <p class="up-result small">
            <template v-if="i.state === 'queued'">Waiting…</template>
            <template v-else-if="i.state === 'uploading'">{{ i.audio ? 'Transcribing the audio…' : 'Uploading…' }}</template>
            <span v-else-if="i.state === 'error'" class="bad-text">{{ i.error }}</span>
            <template v-else-if="i.result?.status === 'split'">
              <b>→ {{ counted(i.result.chapters ?? 0, 'chapter') }} in the folder “{{ i.result.folder }}”</b>
              <template v-if="(i.result.parts?.length ?? 0) > (i.result.chapters ?? 0)"> (and the front matter)</template>
              <template v-if="i.result.versions"> · {{ counted(i.result.versions, 'new version') }}</template>
              <template v-if="i.result.unchanged"> · {{ i.result.unchanged }} unchanged</template>
              <template v-if="i.result.failed"> · <span class="bad-text">{{ i.result.failed }} not imported</span></template>
              <template v-if="bookRead(i).total"> · <span role="status">{{ bookRead(i).read }} of {{ bookRead(i).total }} read by the AI</span></template>
              <template v-if="bookRead(i).failed"> · <span class="bad-text">{{ bookRead(i).failed }} didn’t finish</span></template>
            </template>
            <template v-else-if="i.result?.status === 'duplicate'">
              Same text as {{ i.result.same_as?.filename === i.name ? '' : `${i.result.same_as?.title} ` }}v{{ i.result.same_as?.version }}, skipped.
            </template>
            <template v-else-if="i.result">
              <b>{{ i.result.version === 1 ? `Added to ${place(i.result.folder)}` : `New version v${i.result.version} of ${i.name} in ${place(i.result.folder)}` }}</b>
              <template v-if="i.result.same_name_in"> · a separate document: the {{ i.name }} {{ i.result.same_name_in.folder ? `in ${i.result.same_name_in.folder}` : 'in the Library root' }} is unchanged</template>
              <template v-if="i.result.duration_ms != null"> · {{ clockMs(i.result.duration_ms) }} transcribed</template>
              · {{ counted(i.result.passages ?? 0, i.result.duration_ms != null ? 'timed passage' : 'passage') }}
              <template v-if="!i.result.extraction">· {{ counted(i.result.candidates ?? 0, 'candidate') }}{{ i.result.candidates ? ' sent to Review' : '' }}<template v-if="i.result.skipped"> ({{ i.result.skipped }} already in the project)</template></template>
              <template v-if="i.result.word_notes"> · {{ counted(i.result.word_notes, 'Word comment') }} added as {{ i.result.word_notes === 1 ? 'a note' : 'notes' }}</template>
              <template v-if="i.result.evidence_moved"> · {{ counted(i.result.evidence_moved, 'pending candidate') }} now {{ i.result.evidence_moved === 1 ? 'cites' : 'cite' }} v{{ i.result.version }}</template>
              <template v-if="i.result.stale_facts">
                · <NuxtLink to="/canon?recheck=1" class="warn-text">{{ i.result.outdated_facts ? `${counted(i.result.outdated_facts, 'canon fact')} lost ${i.result.outdated_facts === 1 ? 'its' : 'their'} quote` : 'no canon quote lost' }}<template v-if="i.result.stale_facts - (i.result.outdated_facts ?? 0)">, {{ i.result.stale_facts - (i.result.outdated_facts ?? 0) }} unchanged to confirm</template></NuxtLink>
              </template>
              <span v-if="i.result.extraction_error" class="bad-text"> · Extraction failed: {{ i.result.extraction_error }}</span>
            </template>
          </p>
          <ExtractionStatus v-if="i.result?.extraction && i.result.document_id" :id="i.result.document_id" />
          <details v-if="i.result?.parts?.length" class="parts" :open="i.result.parts.length <= 3 || undefined">
            <summary class="small">Chapters</summary>
            <ol>
              <li v-for="p in i.result.parts" :key="p.filename" class="small">
                <NuxtLink v-if="p.document_id" :to="`/documents/${p.document_id}`">{{ p.title ?? p.same_as?.title ?? p.filename }}</NuxtLink>
                <span v-else>{{ p.title ?? p.filename }}</span>
                <span v-if="partState(p)" :class="p.status === 'error' ? 'bad-text' : 'faint'"> · {{ partState(p) }}</span>
                <ExtractionStatus v-if="p.extraction && p.document_id" :id="p.document_id" />
              </li>
            </ol>
          </details>
        </div>
      </li>
    </ul>
  </UiPanel>
</template>

<style scoped>
.drop-overlay { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: var(--s-4); background: color-mix(in srgb, var(--canvas) 72%, transparent); pointer-events: none; }
.drop-card { display: grid; justify-items: center; gap: var(--s-2); max-width: 420px; padding: var(--s-6) var(--s-5); border: 2px dashed var(--accent); border-radius: var(--r-lg); background: var(--raised); color: var(--muted); text-align: center; box-shadow: var(--elev-overlay); }
.drop-card svg { color: var(--accent); }
.drop-card b { color: var(--ink); font-size: var(--text-md); }
.up-head { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); align-items: center; justify-content: space-between; padding: var(--s-3) var(--s-5); border-bottom: 1px solid var(--line); }
.up-head:last-child { border-bottom: 0; }
.up-head h2 { margin: 0; font-size: var(--text-md); }
.up-head p { margin: 2px 0 0; }
.up-note { margin: 0; padding: 10px var(--s-5); border-bottom: 1px solid var(--line); }
.up-note:last-child { border-bottom: 0; }
.up-list { list-style: none; margin: 0; padding: 0; max-height: 360px; overflow-y: auto; }
.up-list > li { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: var(--s-3); padding: 10px var(--s-5); border-top: 1px solid var(--line); }
.up-list > li:first-child { border-top: 0; }
.up-icon { margin-top: 2px; color: var(--faint); }
.done .up-icon { color: var(--good); }
.error .up-icon { color: var(--bad); }
.up-main { display: grid; gap: 6px; min-width: 0; }
.up-name { display: flex; gap: var(--s-2); align-items: baseline; justify-content: space-between; min-width: 0; }
.up-name > :first-child { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.up-result { margin: 0; color: var(--muted); }
.bad-text { color: var(--bad); }
.warn-text { color: var(--warn); }
.keep { display: inline-flex; gap: 6px; align-items: center; color: var(--muted); cursor: pointer; }
.parts summary { cursor: pointer; color: var(--muted); }
.parts ol { margin: 6px 0 0; padding-left: var(--s-5); display: grid; gap: 4px; max-height: 240px; overflow-y: auto; }
.parts li { display: flex; flex-wrap: wrap; gap: 0 var(--s-2); align-items: baseline; }
.bar { height: 4px; border-radius: 2px; background: var(--sunken); overflow: hidden; }
.bar span { display: block; height: 100%; width: 0; background: var(--accent); }
.bar.uploading span { width: 40%; animation: slide 1.1s var(--ease) infinite; }
.bar.done span { width: 100%; background: var(--good); }
.bar.error span { width: 100%; background: var(--bad); }
@keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
@media (max-width: 720px) {
  .up-head, .up-list > li { padding-left: var(--s-4); padding-right: var(--s-4); }
}
</style>
