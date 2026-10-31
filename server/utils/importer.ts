import { createHash } from 'node:crypto'

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

export const DOCUMENT_KINDS = ['scene', 'lore', 'character', 'location', 'quest', 'dialogue', 'other'] as const

// What an import would call a file on its own: its first heading, else the filename.
const derivedTitle = (filename: string, content: string) => content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? filename

// Uploads and documents written in the app take the same path: hash, version, passages, stale citations, extraction.
// `written` carries what the writer chose; the audit says the text was written here, not imported.
// Which document a file is a version of: an upload matches the file with the same name in the folder it lands in (`folderId`,
// null = the Library root); a document moved to another folder keeps its identity, so its next upload goes where it is now.
// Writing in the app names the document directly (`filename` is its key). The key (`documents.filename`) is unique per
// document; `name` is the file's own name. A same-named file in another folder becomes its own document under a key that
// carries its folder. A new version keeps the folder, kind and (if renamed) title of the earlier ones.
export async function importDocument(filename: string, content: string, written?: { title: string, kind: string }, folderId?: string | null) {
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
  const kind = written?.kind ?? prev?.kind ?? (/^S\d+/i.test(filename) ? 'scene' : 'lore')
  const documentId = newId('doc')
  const passages = splitPassages(content).map(p => ({ ...p, id: newId('psg') }))
  if (!passages.length) throw createError({ statusCode: 422, statusMessage: 'EMPTY_DOCUMENT', message: `${filename} has no text.` })

  // The key is identity only (it can carry the folder the first upload landed in); audit and results show the name and folder.
  const name = prev?.name ?? filename
  const where = folderPath(folder)
  let staleFacts = 0
  let evidenceMoved = 0
  tx(() => {
    db.prepare(`insert into documents (id, title, filename, name, kind, sha256, version, content, imported_at, project_id, origin, created_by, folder_id)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(documentId, title, key, name, kind, sha256, version, content, now(), projectId, written ? 'written' : 'import', access().user.id, folder)
    // A written version may carry a new title or kind: the labels are per document, so earlier versions follow.
    if (prev && (prev.title !== title || prev.kind !== kind))
      db.prepare('update documents set title = ?, kind = ? where project_id = ? and filename = ?').run(title, kind, projectId, key)
    const ins = db.prepare('insert into passages values (?, ?, ?, ?, ?, ?, ?)')
    for (const p of passages) ins.run(p.id, documentId, p.ordinal, p.start_line, p.end_line, p.text, projectId)
    const event = written ? (version > 1 ? 'document.version_written' : 'document.written') : (version > 1 ? 'document.version_added' : 'document.imported')
    audit(event, 'document', documentId, { filename: name, title, kind, version, sha256, passages: passages.length, folder: where })
    // Old citations are not silently moved to the new version; they are flagged stale until someone reviews them.
    if (version > 1) {
      const stale = db.prepare(`select distinct f.id from facts f join evidence e on e.fact_id = f.id join documents d on d.id = e.document_id
        where f.project_id = ? and f.status = 'canon' and d.filename = ? and d.version < ?`).all(projectId, key, version) as { id: string }[]
      staleFacts = stale.length
      if (stale.length) audit('citation.stale', 'document', documentId, { filename: name, title, folder: where, version, fact_ids: stale.map(s => s.id) })
      evidenceMoved = movePendingEvidence(key, documentId, version, passages, { name, folder: where })
    }
  })

  // Extraction failing must not lose the import.
  let extraction: Awaited<ReturnType<typeof extractInto>> | null = null
  let extractionError: string | null = null
  try {
    extraction = await extractInto({ id: documentId, filename: key, title, content }, passages)
  } catch (e) {
    extractionError = (e as Error).message
    audit('job.failed', 'document', documentId, { step: 'extraction', error: extractionError })
  }

  return {
    filename, title, status: 'imported' as const, document_id: documentId, version, folder: where, same_name_in: sameNameIn, passages: passages.length, stale_facts: staleFacts, evidence_moved: evidenceMoved,
    candidates: extraction?.created ?? 0, unverified: extraction?.unverified ?? 0, skipped: extraction?.skipped ?? 0, extraction_error: extractionError,
  }
}

// A new version: a PENDING candidate's quote that appears exactly once in it now cites that passage, so nobody re-reviews an
// unrelated edit. The candidate keeps its origin and proposer; the audit keeps where the quote was. A quote that is gone or
// appears more than once stays on the old version (stale). Canon evidence never moves: a person re-checks it.
function movePendingEvidence(key: string, documentId: string, version: number, passages: { id: string, text: string, start_line: number }[], doc: { name: string, folder: string | null }) {
  const db = useDb()
  const rows = db.prepare(`select e.id, e.fact_id, e.quote, e.document_id, e.passage_id, d.version, p.start_line from evidence e
    join facts f on f.id = e.fact_id join documents d on d.id = e.document_id left join passages p on p.id = e.passage_id
    where f.project_id = ? and f.status = 'pending' and e.verified = 1 and d.filename = ? and d.version < ?`).all(pid(), key, version) as { id: string, fact_id: string, quote: string, document_id: string, passage_id: string, version: number, start_line: number | null }[]
  const occurrences = (text: string, q: string) => {
    let n = 0
    for (let i = text.indexOf(q); i !== -1; i = text.indexOf(q, i + 1)) n++
    return n
  }
  const move = db.prepare('update evidence set document_id = ?, passage_id = ? where id = ?')
  let moved = 0
  for (const r of rows) {
    const hits = passages.filter(p => isVerbatimQuote(p.text, r.quote))
    if (hits.length !== 1 || occurrences(hits[0]!.text, r.quote) !== 1) continue
    move.run(documentId, hits[0]!.id, r.id)
    audit('candidate.evidence_moved', 'fact', r.fact_id, {
      filename: doc.name, folder: doc.folder, quote: r.quote,
      from: { document_id: r.document_id, version: r.version, passage_id: r.passage_id, line: r.start_line },
      to: { document_id: documentId, version, passage_id: hits[0]!.id, line: hits[0]!.start_line },
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

// Runs extraction on one document version and stores the candidates as pending. Never touches canon. A candidate the project
// already has, in any status, is skipped. Names are compared under their kept analysis identity (entity_merges), because a
// merge rewrites the names of the facts it moves but keeps their statements: a re-imported "Lighthouse" candidate equals the
// canon (or rejected) fact now naming "Causeway". Stored facts keep their original statements and quotes.
export async function extractInto(doc: { id: string, filename: string, title: string, content: string }, passages: { id: string, text: string }[]) {
  const db = useDb()
  const projectId = pid()
  const drafts = await extractCandidates({ id: doc.id, filename: doc.filename, title: doc.title, text: doc.content })
  const model = modelInfo()
  const existing = db.prepare('select statement, kind, subject, predicate, object, value, t_from, t_to, precision, status from facts where project_id = ?').all(projectId) as { statement: string, kind: string, subject: string, predicate: string, object: string | null, value: string | null, t_from: number | null, t_to: number | null, precision: string | null, status: string }[]
  const seen = new Map<string, string>()
  const kept = keptNameOf()
  const keyOf = (f: Parameters<typeof factKey>[0]) => factKey({ ...f, subject: kept(f.subject), object: kept(f.object) })
  const remember = (keys: string[], status: string) => { for (const k of keys) seen.set(k, status) }
  for (const f of existing) remember([`s:${norm(f.statement)}`, `k:${keyOf(f)}`], f.status)
  let created = 0
  let unverified = 0
  const skipped: Record<string, number> = {}
  tx(() => {
    for (const c of drafts) {
      const tFrom = parseStoryTime(c.time?.from)
      const tTo = parseStoryTime(c.time?.to)
      const keys = [`s:${norm(c.statement)}`, `k:${keyOf({ ...c, t_from: tFrom, t_to: tTo, precision: c.time ? (c.time.precision ?? 'exact') : null })}`]
      const already = keys.map(k => seen.get(k)).find(Boolean)
      if (already) {
        skipped[already] = (skipped[already] ?? 0) + 1
        continue
      }
      remember(keys, 'pending')
      const match = findQuotePassage(passages, c.quote)
      const passage = match?.passage
      const precision = c.time ? (c.time.precision ?? 'exact') : null
      const factId = newId('fact')
      db.prepare(`insert into facts (id, kind, subject, predicate, object, value, statement, t_from, t_to, time_label, precision,
        status, confidence, origin, model_id, created_at, project_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`)
        .run(factId, c.kind, c.subject, c.predicate, c.object ?? null, c.value == null ? null : String(c.value), c.statement, tFrom, tTo,
          timeLabel(tFrom, tTo, precision), precision, c.confidence ?? null, `model:${PROMPT_VERSIONS.extract}`, model.id, now(), projectId)
      db.prepare('insert into evidence (id, fact_id, document_id, passage_id, quote, verified, project_id) values (?, ?, ?, ?, ?, ?, ?)')
        .run(newId('ev'), factId, doc.id, passage?.id ?? null, match?.quote ?? c.quote ?? '', passage ? 1 : 0, projectId)
      audit('candidate.created', 'fact', factId, { document_id: doc.id, quote_verified: !!passage, model_id: model.id })
      created++
      if (!passage) unverified++
    }
  })
  return { proposed: drafts.length, created, unverified, skipped: Object.values(skipped).reduce((a, b) => a + b, 0), skipped_by_status: skipped, model }
}
