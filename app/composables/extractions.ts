// Background extraction statuses (server/utils/extractions.ts), shared by the uploader, the Library, a document page and
// Review. One poller for the whole page: GET /api/extractions every 2.5 s, only while something is queued, being
// read or checked by the critic, and only while the tab is visible. When a run ends, the Review count (stats) refreshes and
// every mounted user's onFinish runs (the Library reloads its rows, Review its queue).
// The state is module-level and filled only in the browser (on mount), so the server always renders it empty.
export interface Extraction {
  document_id: string, filename: string, title: string, version: number, status: 'queued' | 'reading' | 'critic' | 'done' | 'failed'
  queued_at: string, started_at: string | null, ended_at: string | null, created: number | null, unverified: number | null, skipped: number | null
  error: string | null, elapsed_ms: number | null
}
const ACTIVE = ['queued', 'reading', 'critic']
export const extractionActive = (e?: { status: string } | null) => !!e && ACTIVE.includes(e.status)

const POLL_MS = 2500
const list = ref<Extraction[]>([])
const byId = computed(() => new Map(list.value.map(e => [e.document_id, e])))
const active = computed(() => list.value.filter(extractionActive))
const now = ref(0)
let fetchedAt = 0
let users = 0
let timer: ReturnType<typeof setInterval> | undefined
const hooks = new Set<() => void>()

async function load() {
  const was = new Map(list.value.map(e => [e.document_id, e.status]))
  const next = await $fetch<Extraction[]>('/api/extractions').catch(() => null)
  if (!next) return
  list.value = next
  fetchedAt = now.value = Date.now()
  if (next.some(e => !extractionActive(e) && ACTIVE.includes(was.get(e.document_id) ?? ''))) {
    refreshNuxtData('stats')
    for (const h of hooks) h()
  }
}
function tick() {
  now.value = Date.now()
  if (document.visibilityState === 'visible' && active.value.length && now.value - fetchedAt >= POLL_MS) load()
}
// An upload's or retry's answer: shown at once, and the poller picks it up.
function track(documentId: string, e: { status: string, queued_at: string }, doc: { filename?: string, title?: string, version?: number } = {}) {
  const row: Extraction = { document_id: documentId, filename: doc.filename ?? '', title: doc.title ?? '', version: doc.version ?? 1, status: e.status as Extraction['status'],
    queued_at: e.queued_at, started_at: null, ended_at: null, created: null, unverified: null, skipped: null, error: null, elapsed_ms: null }
  list.value = [row, ...list.value.filter(x => x.document_id !== documentId)]
  fetchedAt = 0 // poll on the next tick
}
async function retry(documentId: string) {
  const r = await $fetch<{ document_id: string, version: number, extraction: { status: string, queued_at: string } }>(`/api/documents/${documentId}/extract`, { method: 'POST', body: { background: true } })
  track(r.document_id, r.extraction, { version: r.version })
}
// "The AI is reading · 0:35": the server's elapsed time when polled, plus the time since.
function label(e: Extraction) {
  if (e.status === 'queued') return 'Waiting'
  if (e.status === 'critic') return 'AI critic checking'
  if (e.status === 'reading') {
    const s = Math.max(0, Math.floor(((e.elapsed_ms ?? 0) + (fetchedAt ? Math.max(0, now.value - fetchedAt) : 0)) / 1000))
    return `The AI is reading · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  if (e.status === 'done') return e.created ? `Done · ${counted(e.created, 'fact')} to review` : 'Done · nothing new to review'
  return 'Didn’t finish'
}

export function useExtractions(onFinish?: () => void) {
  onMounted(() => {
    if (onFinish) hooks.add(onFinish)
    if (users++) return
    load()
    timer = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
  })
  onBeforeUnmount(() => {
    if (onFinish) hooks.delete(onFinish)
    if (--users) return
    clearInterval(timer)
    document.removeEventListener('visibilitychange', tick)
  })
  return { list, byId, active, label, track, retry, load }
}
