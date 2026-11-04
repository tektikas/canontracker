import { createHash } from 'node:crypto'
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Turn } from './audio'

// A passage is a heading line or a run of non-empty lines. Line numbers are 1-based.
export function splitPassages(content: string) {
  const out: { start: number, end: number, lines: string[] }[] = []
  let cur: typeof out[number] | null = null
  content.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) {
      if (cur) out.push(cur)
      cur = null
      if (line.startsWith('#')) out.push({ start: i + 1, end: i + 1, lines: [line.replace(/^#+\s*/, '')] })
      return
    }
    if (cur) {
      cur.end = i + 1
      cur.lines.push(line)
    } else {
      cur = { start: i + 1, end: i + 1, lines: [line] }
    }
  })
  if (cur) out.push(cur)
  return out.map((p, i) => ({ ordinal: i + 1, start_line: p.start, end_line: p.end, text: p.lines.join('\n') }))
}

export const DOCUMENT_KINDS = ['scene', 'lore', 'character', 'location', 'quest', 'dialogue', 'recording', 'other'] as const

// The kind a new upload gets when nobody chose one. Impact counts scenes, so the story's own text should be one: "S01…" in
// any project, and in a novel or prose project also chapter-like names (chapterLike, shared/utils/upload.ts). Everything
// else starts as lore; the Library changes a kind in one step.
function sceneLike(filename: string, projectId: string) {
  if (/^S\d+/i.test(filename)) return true
  const medium = (useDb().prepare('select medium from projects where id = ?').get(projectId) as { medium: string } | undefined)?.medium
  return medium === 'prose' && chapterLike(filename)
}

// What an import would call a file on its own: its first heading, else the filename.
const derivedTitle = (filename: string, content: string) => content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? filename

// Uploads and documents written in the app take the same path: hash, version, passages, stale citations, extraction.
// `written` carries what the writer chose; the audit says the text was written here, not imported.
// Which document a file is a version of: an upload matches the file with the same name in the folder it lands in (`folderId`,
// null = the Library root); a document moved to another folder keeps its identity, so its next upload goes where it is now.
// Writing in the app names the document directly (`filename` is its key). The key (`documents.filename`) is unique per
// document; `name` is the file's own name. A same-named file in another folder becomes its own document under a key that
// carries its folder. A new version keeps the folder, kind and (if renamed) title of the earlier ones.
// `recording`: the text is a transcript of that audio (one passage per turn, in order); it is stored with the version and the
// passages keep the turns' times. The audio itself is written by the caller (storeAudio) before this runs.
// `word`: a .docx upload. Its file is kept as it came (originalPath), and its comments become editorial notes by the uploader.
export interface RecordingImport { turns: Turn[], audio_sha256: string, bytes: number, duration_ms: number, original_name: string, model_id: string, mode: string, session_ids: string[], script_key: string | null }
// `storeAfter`: extraction's model call starts at once, but its candidates are stored only after that promise settles (a batch
// import runs several documents at a time and keeps the order in which candidates are stored, so duplicates resolve the same way).
// `background`: the version is stored and the result returned at once; extraction and the critic run after the response
// (server/utils/extractions.ts) and the result carries `extraction` (status queued) instead of candidate counts.
export async function importDocument(filename: string, content: string, written?: { title: string, kind: string }, folderId?: string | null, recording?: RecordingImport, word?: { original: Buffer, comments: WordComment[] }, storeAfter?: Promise<unknown>, background = false) {
  const db = useDb()
  const projectId = pid()
  const sha256 = createHash('sha256').update(content).digest('hex')
  const dup = db.prepare('select id, name, title, version from documents where project_id = ? and sha256 = ?').get(projectId, sha256) as { id: string, name: string, title: string, version: number } | undefined
  if (dup) return { filename, status: 'duplicate' as const, document_id: dup.id, same_as: { filename: dup.name, title: dup.title, version: dup.version } }

  const prev = (written
    ? db.prepare('select * from documents where project_id = ? and filename = ? order by version desc limit 1').get(projectId, filename)
    : db.prepare('select * from documents where project_id = ? and name = ? and folder_id is ? order by version desc limit 1').get(projectId, filename, folderId ?? null)) as unknown as DocumentRow | undefined
  const folder = prev ? prev.folder_id : (folderId ?? null)
  let key = prev?.filename ?? filename
  let sameNameIn: { folder: string | null } | null = null
  if (!prev) {
    const taken = (k: string) => !!db.prepare('select 1 from documents where project_id = ? and filename = ?').get(projectId, k)
    const other = db.prepare('select folder_id from documents where project_id = ? and name = ? limit 1').get(projectId, filename) as { folder_id: string | null } | undefined
    if (other) sameNameIn = { folder: folderPath(other.folder_id) }
    if (taken(key)) {
      const base = `${folderPath(folder) ?? 'Library'}/${filename}`
      key = base
      for (let n = 2; taken(key); n++) key = `${base} (${n})`
    }
  }
  const version = (prev?.version ?? 0) + 1
  const renamed = prev && prev.title !== derivedTitle(prev.name, prev.content)
  const title = written?.title ?? (renamed ? prev.title : derivedTitle(filename, content))
  const kind = written?.kind ?? prev?.kind ?? (recording ? 'recording' : sceneLike(filename, projectId) ? 'scene' : 'lore')
  const documentId = newId('doc')
  const passages = splitPassages(content).map(p => ({ ...p, id: newId('psg') }))
  if (!passages.length) throw createError({ statusCode: 422, statusMessage: 'EMPTY_DOCUMENT', message: recording ? `No speech was found in ${filename}.` : `${filename} has no text.` })
  if (recording && recording.turns.length !== passages.length) throw new Error('Transcript turns and passages do not line up.')
  const origin = recording ? 'recording' : written ? 'written' : 'import'

  // The key is identity only (it can carry the folder the first upload landed in); audit and results show the name and folder.
  const name = prev?.name ?? filename
  const where = folderPath(folder)
  let staleFacts = 0
  let outdatedFacts = 0
  let evidenceMoved = 0
  let wordNotes = 0
  // The original .docx is written first (temp file, then rename), so a version is never committed without it. If the commit
  // then fails, the file goes too and a retry imports cleanly (its text is not yet a duplicate).
  const original = word && originalPath(projectId, sha256)
  if (word) {
    const tmp = `${original}.${newId('tmp')}`
    try {
      mkdirSync(join(ORIGINALS_DIR, projectId), { recursive: true })
      writeFileSync(tmp, word.original)
      renameSync(tmp, original!)
    } catch {
      rmSync(tmp, { force: true })
      throw createError({ statusCode: 500, statusMessage: 'ORIGINAL_NOT_STORED', message: `The Word file ${filename} could not be stored, so nothing was imported. Try again.` })
    }
  }
  try {
    tx(() => {
      db.prepare(`insert into documents (id, title, filename, name, kind, sha256, version, content, imported_at, project_id, origin, created_by, folder_id)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(documentId, title, key, name, kind, sha256, version, content, now(), projectId, origin, access().user.id, folder)
      // A written version may carry a new title or kind: the labels are per document, so earlier versions follow.
      if (prev && (prev.title !== title || prev.kind !== kind))
        db.prepare('update documents set title = ?, kind = ? where project_id = ? and filename = ?').run(title, kind, projectId, key)
      const ins = db.prepare('insert into passages (id, document_id, ordinal, start_line, end_line, text, project_id, start_ms, end_ms, speaker) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      passages.forEach((p, i) => {
        const t = recording?.turns[i]
        ins.run(p.id, documentId, p.ordinal, p.start_line, p.end_line, p.text, projectId, t?.start_ms ?? null, t?.end_ms ?? null, t?.speaker ?? null)
      })
      // A later version keeps the script the recording is compared with.
      const scriptKey = recording && (recording.script_key ?? (prev ? getRecording(prev.id)?.script_key ?? null : null))
      if (recording)
        db.prepare(`insert into recordings (document_id, audio_sha256, bytes, duration_ms, original_name, model_id, mode, session_ids, script_key, created_by, created_at, project_id)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(documentId, recording.audio_sha256, recording.bytes, recording.duration_ms, recording.original_name, recording.model_id,
          recording.mode, JSON.stringify(recording.session_ids), scriptKey ?? null, access().user.id, now(), projectId)
      const event = recording ? (version > 1 ? 'recording.version_added' : 'recording.imported')
        : written ? (version > 1 ? 'document.version_written' : 'document.written') : (version > 1 ? 'document.version_added' : 'document.imported')
      audit(event, 'document', documentId, { filename: name, title, kind, version, sha256, passages: passages.length, folder: where,
        ...(recording && { audio_sha256: recording.audio_sha256, duration_ms: recording.duration_ms, model_id: recording.model_id }) })
      // Old canon citations are not silently moved to the new version. Each is checked against it (recheck.ts): a quote that
      // still reads the same waits for a person to confirm it, a quote that is gone marks the fact "evidence outdated".
      if (version > 1) {
        const byFact = recheckByFact(staleCanonCitations().filter(c => c.document_key === key))
        const ids = (state: string) => [...byFact].filter(([, s]) => s === state).map(([id]) => id)
        const outdated = ids('outdated')
        staleFacts = byFact.size
        outdatedFacts = outdated.length
        if (byFact.size) audit('citation.stale', 'document', documentId, { filename: name, title, folder: where, version, fact_ids: [...byFact.keys()], outdated_fact_ids: outdated, unchanged_fact_ids: ids('unchanged') })
        evidenceMoved = movePendingEvidence(key, documentId, version, passages, { name, folder: where })
      }
      if (word) wordNotes = commentNotes(word.comments, key, documentId, passages)
    })
  } catch (e) {
    if (original) rmSync(original, { force: true })
    throw e
  }

  const stored = {
    filename, title, status: 'imported' as const, document_id: documentId, version, folder: where, same_name_in: sameNameIn, passages: passages.length, stale_facts: staleFacts, outdated_facts: outdatedFacts, evidence_moved: evidenceMoved,
    word_notes: wordNotes,
  }
  if (background) return { ...stored, extraction: queueExtraction({ id: documentId, filename: key, title, content, name, version, folder: where }) }

  // Extraction failing must not lose the import.
  let extraction: Awaited<ReturnType<typeof extractInto>> | null = null
  let extractionError: string | null = null
  try {
    extraction = await extractInto({ id: documentId, filename: key, title, content }, passages, storeAfter)
  } catch (e) {
    extractionError = (e as Error).message
    audit('job.failed', 'document', documentId, { step: 'extraction', error: extractionError })
  }

  return {
    ...stored, candidates: extraction?.created ?? 0, unverified: extraction?.unverified ?? 0, skipped: extraction?.skipped ?? 0, extraction_error: extractionError,
  }
}

// The uploaded .docx, kept byte for byte per document version (keyed by the version's text hash), served only through
// GET /api/documents/<id>/original. Cleared with the project's data on reset.
export const ORIGINALS_DIR = join('.data', 'originals')
export const originalPath = (projectId: string, sha256: string) => join(ORIGINALS_DIR, projectId, `${sha256}.docx`)

// Word comments → notes by the uploader, pinned to the passage where the commented words start (the words themselves when
// they are found there, as a note made in the reader would be). A comment already noted on an earlier version is not repeated.
function commentNotes(comments: WordComment[], key: string, documentId: string, passages: { id: string, text: string, start_line: number, end_line: number }[]) {
  const db = useDb()
  const user = access().user.id
  // Earlier versions' notes, read once (one lookup per comment would scan the project's notes per comment).
  const seen = new Set((db.prepare('select n.body, n.quote from notes n join documents d on d.id = n.document_id where n.project_id = ? and d.filename = ?')
    .all(pid(), key) as { body: string, quote: string }[]).map(n => JSON.stringify([n.body, n.quote])))
  const ins = db.prepare(`insert into notes (id, document_id, passage_id, quote, body, status, created_by, created_at, updated_at, project_id)
    values (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`)
  let n = 0
  for (const c of comments) {
    const passage = passages.find(p => p.start_line <= c.line && c.line <= p.end_line)
    if (!passage) continue
    const body = `From Word comment by ${c.author}: ${c.text}`.slice(0, 4000)
    const match = findQuotePassage([passage], c.quote)
    const quote = match?.quote ?? (c.quote && passage.text.includes(c.quote) ? c.quote : '')
    const k = JSON.stringify([body, quote])
    if (seen.has(k)) continue
    seen.add(k)
    const id = newId('note')
    ins.run(id, documentId, passage.id, quote, body, user, now(), now(), pid())
    audit('note.created', 'note', id, { document_id: documentId, passage_id: passage.id, quote, body, from: 'word_comment', comment_author: c.author })
    n++
  }
  return n
}

// A new version: a PENDING candidate's quote that appears exactly once in it (matched like findQuotePassage) now cites that
// passage, so nobody re-reviews an unrelated edit. The candidate keeps its origin and proposer; the audit keeps where the quote was. A quote that is gone or
// appears more than once stays on the old version (stale). Canon evidence never moves: a person re-checks it.
function movePendingEvidence(key: string, documentId: string, version: number, passages: { id: string, text: string, start_line: number }[], doc: { name: string, folder: string | null }) {
  const db = useDb()
  const rows = db.prepare(`select e.id, e.fact_id, e.quote, e.document_id, e.passage_id, d.version, p.start_line from evidence e
    join facts f on f.id = e.fact_id join documents d on d.id = e.document_id left join passages p on p.id = e.passage_id
    where f.project_id = ? and f.status = 'pending' and e.verified = 1 and d.filename = ? and d.version < ?`).all(pid(), key, version) as { id: string, fact_id: string, quote: string, document_id: string, passage_id: string, version: number, start_line: number | null }[]
  const move = db.prepare('update evidence set document_id = ?, passage_id = ?, quote = ? where id = ?')
  let moved = 0
  for (const r of rows) {
    // Matched like any quote (findQuotePassage's folding, counted as canon re-check counts it); the evidence then holds the new version's exact characters.
    const { passage: p, quote } = quoteOccurrences(passages, r.quote)
    if (!p || !quote) continue
    move.run(documentId, p.id, quote, r.id)
    audit('candidate.evidence_moved', 'fact', r.fact_id, {
      filename: doc.name, folder: doc.folder, quote: r.quote, ...(quote !== r.quote && { new_quote: quote }),
      from: { document_id: r.document_id, version: r.version, passage_id: r.passage_id, line: r.start_line },
      to: { document_id: documentId, version, passage_id: p.id, line: p.start_line },
    })
    moved++
  }
  return moved
}

// What the project already has (any status: pending, canon, rejected or superseded, so a decision a person made stands):
// the same statement, or the same kind, names, value and story time in other words.
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[.!?\s]+$/, '').trim()
const factKey = (f: { kind: string, subject: string, predicate: string, object?: string | null, value?: unknown, t_from?: number | null, t_to?: number | null, precision?: string | null }) =>
  [f.kind, norm(f.subject), norm(f.predicate), norm(f.object), norm(f.value == null ? '' : String(f.value)), f.t_from ?? '', f.t_to ?? '', f.precision ?? ''].join('|')

// The names extraction should reuse: every wiki page ("Title = alias, …"), then the names earlier candidates and canon typed as
// something (not "none"), most used first. Keeps chapters extracted one by one from naming one person two ways.
function knownNames(max = 150) {
  syncEntities()
  const pages = listEntities()
  const covered = new Set(pages.flatMap(namesOf).map(normName))
  const lines = pages.map(e => [e.name, ...namesOf(e).filter(n => n !== e.name)].join(' = '))
  const rows = useDb().prepare(`select name, count(*) n from (
      select subject name, subject_type t from facts where project_id = ? and status != 'rejected'
      union all select object, object_type from facts where project_id = ? and status != 'rejected' and object is not null)
    where t is not null and t != 'none' group by lower(name) order by n desc`).all(pid(), pid()) as { name: string }[]
  for (const r of rows) if (!covered.has(normName(r.name)) && nameLike(r.name)) lines.push(r.name)
  return lines.slice(0, max)
}

// Runs extraction on one document version and stores the candidates as pending. Never touches canon. A candidate the project
// already has, in any status, is skipped. Names are compared under their kept analysis identity (entity_merges), because a
// merge rewrites the names of the facts it moves but keeps their statements: a re-imported "Lighthouse" candidate equals the
// canon (or rejected) fact now naming "Causeway". Stored facts keep their original statements and quotes.
// A recording's transcript that restates a pending candidate cites that candidate too (a verified quote in the
// transcript, like movePendingEvidence adds one for a new version), so the take's script comparison still sees what the line
// says and can flag it against canon; no second candidate is made. Canon and decided candidates are never touched.
// `onCritic`: called when the critic starts reading the new candidates (a background run shows that step).
export async function extractInto(doc: { id: string, filename: string, title: string, content: string }, passages: { id: string, text: string }[], storeAfter?: Promise<unknown>, onCritic?: () => void) {
  const db = useDb()
  const projectId = pid()
  const drafts = await extractCandidates({ id: doc.id, filename: doc.filename, title: doc.title, text: doc.content, names: knownNames() })
  await storeAfter?.catch(() => {})
  // The model call can take a minute: a project reset (demo load) in the meantime removes the document it read.
  if (!db.prepare('select 1 from documents where id = ? and project_id = ?').get(doc.id, projectId)) throw new Error('The document was removed while the AI was reading it.')
  const model = modelInfo()
  const existing = db.prepare('select id, statement, kind, subject, predicate, object, value, t_from, t_to, precision, status from facts where project_id = ?').all(projectId) as { id: string, statement: string, kind: string, subject: string, predicate: string, object: string | null, value: string | null, t_from: number | null, t_to: number | null, precision: string | null, status: string }[]
  const seen = new Map<string, { id: string, status: string }>()
  const kept = keptNameOf()
  const keyOf = (f: Parameters<typeof factKey>[0]) => factKey({ ...f, subject: kept(f.subject), object: kept(f.object) })
  const remember = (keys: string[], fact: { id: string, status: string }) => { for (const k of keys) seen.set(k, fact) }
  for (const f of existing) remember([`s:${norm(f.statement)}`, `k:${keyOf(f)}`], f)
  const recording = (db.prepare('select origin from documents where id = ?').get(doc.id) as { origin: string } | undefined)?.origin === 'recording'
  const citesHere = db.prepare('select 1 from evidence where fact_id = ? and document_id = ?')
  const created: string[] = []
  let unverified = 0
  const skipped: Record<string, number> = {}
  tx(() => {
    for (const c of drafts) {
      const { from: tFrom, to: tTo, day } = parseStoryRange(c.time?.from, c.time?.to)
      const keys = [`s:${norm(c.statement)}`, `k:${keyOf({ ...c, t_from: tFrom, t_to: tTo, precision: c.time ? (c.time.precision ?? 'exact') : null })}`]
      const already = keys.map(k => seen.get(k)).find(Boolean)
      if (already) {
        skipped[already.status] = (skipped[already.status] ?? 0) + 1
        const match = recording && already.status === 'pending' ? findQuotePassage(passages, c.quote) : null
        if (match && !citesHere.get(already.id, doc.id)) {
          db.prepare('insert into evidence (id, fact_id, document_id, passage_id, quote, verified, project_id) values (?, ?, ?, ?, ?, 1, ?)')
            .run(newId('ev'), already.id, doc.id, match.passage.id, match.quote, projectId)
          audit('candidate.evidence_added', 'fact', already.id, { document_id: doc.id, title: doc.title, passage_id: match.passage.id, quote: match.quote, from: 'recording', model_id: model.id })
        }
        continue
      }
      const factId = newId('fact')
      remember(keys, { id: factId, status: 'pending' })
      const match = findQuotePassage(passages, c.quote)
      const passage = match?.passage
      const precision = c.time ? (c.time.precision ?? 'exact') : null
      db.prepare(`insert into facts (id, kind, subject, predicate, object, value, statement, t_from, t_to, time_label, precision,
        status, confidence, origin, model_id, created_at, project_id, subject_type, object_type) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`)
        .run(factId, c.kind, c.subject, c.predicate, c.object ?? null, c.value == null ? null : String(c.value), c.statement, tFrom, tTo,
          timeLabel(tFrom, tTo, precision, day), precision, c.confidence ?? null, `model:${PROMPT_VERSIONS.extract}`, model.id, now(), projectId,
          c.subject_type ?? null, c.object ? (c.object_type ?? null) : null)
      db.prepare('insert into evidence (id, fact_id, document_id, passage_id, quote, verified, project_id) values (?, ?, ?, ?, ?, ?, ?)')
        .run(newId('ev'), factId, doc.id, passage?.id ?? null, match?.quote ?? c.quote ?? '', passage ? 1 : 0, projectId)
      audit('candidate.created', 'fact', factId, { document_id: doc.id, quote_verified: !!passage, model_id: model.id })
      created.push(factId)
      if (!passage) unverified++
    }
  })
  // The AI critic reads the new verified candidates next. Its opinion is advice on the review queue; failing must not lose them.
  let critic: Awaited<ReturnType<typeof runCritic>> | null = null
  let criticError: string | null = null
  try {
    if (created.length) onCritic?.()
    critic = await runCritic(created)
  } catch (e) {
    criticError = (e as Error).message
    audit('job.failed', 'document', doc.id, { step: 'critic', error: criticError })
  }
  return { proposed: drafts.length, created: created.length, critic, critic_error: criticError, unverified, skipped: Object.values(skipped).reduce((a, b) => a + b, 0), skipped_by_status: skipped, model }
}
