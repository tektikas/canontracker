// Background extraction: the web uploader (and "Try again") stores the document version at once and answers; the model's
// extraction and the AI critic then run here, in this server process, while the page polls GET /api/extractions.
// One row per document version in `extractions`: queued → reading → critic → done | failed.
//
// Access context: pid(), access() and audit() read the request's event through Nitro's asyncContext (AsyncLocalStorage).
// queueExtraction starts the job (`void run()`) inside the request handler, so the job's whole async chain keeps that
// request's store, the uploader's project and identity, after the response has gone. A job waiting for a slot awaits its
// own promise, so it resumes in its own context, never in the context of the job that freed the slot. run() checks it
// (`access().project.id` must be the project it was queued for) before touching anything.
const MAX_RUNNING = 3 // ponytail: per process; a second server process on the same database has its own three
let running = 0
const waiting: (() => void)[] = []
const slot = () => (running < MAX_RUNNING ? (running++, Promise.resolve()) : new Promise<void>(r => waiting.push(r)))
const release = () => { const next = waiting.shift(); if (next) next(); else running-- } // a freed slot passes straight on

export const EXTRACTION_ACTIVE = ['queued', 'reading', 'critic'] as const
export type ExtractionStatus = typeof EXTRACTION_ACTIVE[number] | 'done' | 'failed'
export const NO_MODEL_OUTPUT = 'Nothing was proposed: no AI model is connected on this server. Select words in the text to add a fact.'
export const INTERRUPTED = 'Interrupted by a restart. Try again.'

const set = (documentId: string, fields: Record<string, string | number | null>) => {
  const keys = Object.keys(fields)
  useDb().prepare(`update extractions set ${keys.map(k => `${k} = ?`).join(', ')} where document_id = ? and project_id = ?`)
    .run(...Object.values(fields), documentId, pid())
}

/** Queue extraction (then the critic) of one stored document version and return at once. `reextract`: audited as a re-extract. */
export function queueExtraction(doc: { id: string, filename: string, title: string, content: string, name: string, version: number, folder: string | null }, reextract = false) {
  const projectId = pid()
  const queuedAt = now()
  useDb().prepare(`insert into extractions (document_id, project_id, status, queued_at, started_at, ended_at, created, unverified, skipped, error)
    values (?, ?, 'queued', ?, null, null, null, null, null, null)
    on conflict (document_id) do update set status = 'queued', queued_at = excluded.queued_at, started_at = null, ended_at = null, created = null, unverified = null, skipped = null, error = null`)
    .run(doc.id, projectId, queuedAt)
  void run(doc, projectId, reextract)
  return { status: 'queued' as ExtractionStatus, queued_at: queuedAt }
}

async function run(doc: Parameters<typeof queueExtraction>[0], projectId: string, reextract: boolean) {
  await slot()
  try {
    if (access().project.id !== projectId) throw new Error('Lost the project this extraction was queued for.')
    set(doc.id, { status: 'reading', started_at: now() })
    const model = modelInfo()
    // Recorded mode replays output recorded for the sample files' own text only: say so instead of reporting "0 candidates".
    if (model.mode === 'mock' && !(await hasRecordedExtraction(doc.content))) throw new Error(NO_MODEL_OUTPUT)
    const passages = useDb().prepare('select id, text from passages where document_id = ? order by ordinal').all(doc.id) as { id: string, text: string }[]
    const r = await extractInto(doc, passages, undefined, () => set(doc.id, { status: 'critic' }))
    set(doc.id, { status: 'done', ended_at: now(), created: r.created, unverified: r.unverified, skipped: r.skipped })
    if (reextract) audit('document.reextracted', 'document', doc.id, {
      filename: doc.name, folder: doc.folder, title: doc.title, version: doc.version, model_id: model.id,
      proposed: r.proposed, created: r.created, unverified: r.unverified, skipped: r.skipped_by_status, background: true,
    })
  } catch (e) {
    const error = (e as Error).message
    try {
      set(doc.id, { status: 'failed', ended_at: now(), error })
      audit('job.failed', 'document', doc.id, { step: reextract ? 're-extraction' : 'extraction', error, background: true })
    } catch (inner) { console.error('Background extraction could not record its failure', doc.id, inner) }
  } finally {
    release()
  }
}

/** Every extraction status in this project (one row per document version that had a background run), for polling. */
export function listExtractions() {
  const rows = useDb().prepare(`select x.document_id, d.filename, d.title, d.version, x.status, x.queued_at, x.started_at, x.ended_at, x.created, x.unverified, x.skipped, x.error
    from extractions x join documents d on d.id = x.document_id where x.project_id = ? order by x.queued_at desc`).all(pid()) as unknown as ExtractionRow[]
  const t = Date.now()
  // elapsed_ms is measured on the server's clock, so the page's timer doesn't depend on the viewer's clock.
  return rows.map(r => ({ ...r, elapsed_ms: r.started_at ? (r.ended_at ? Date.parse(r.ended_at) : t) - Date.parse(r.started_at) : null }))
}
export interface ExtractionRow {
  document_id: string, filename: string, title: string, version: number, status: ExtractionStatus, queued_at: string, started_at: string | null, ended_at: string | null
  created: number | null, unverified: number | null, skipped: number | null, error: string | null
}
export const extractionOf = (documentId: string) => listExtractions().find(r => r.document_id === documentId) ?? null
