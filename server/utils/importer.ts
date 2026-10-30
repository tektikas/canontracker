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

export const DOCUMENT_KINDS = ['scene', 'lore', 'character', 'other'] as const

// Uploads and documents written in the app take the same path: hash, version, passages, stale citations, extraction.
// `written` carries what the writer chose; the audit says the text was written here, not imported.
export async function importDocument(filename: string, content: string, written?: { title: string, kind: string }) {
  const db = useDb()
  const projectId = pid()
  const sha256 = createHash('sha256').update(content).digest('hex')
  const dup = db.prepare('select id from documents where project_id = ? and sha256 = ?').get(projectId, sha256) as { id: string } | undefined
  if (dup) return { filename, status: 'duplicate' as const, document_id: dup.id }

  const prev = db.prepare('select max(version) v from documents where project_id = ? and filename = ?').get(projectId, filename) as { v: number | null }
  const version = (prev.v ?? 0) + 1
  const title = written?.title ?? content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? filename
  const kind = written?.kind ?? (/^S\d+/i.test(filename) ? 'scene' : 'lore')
  const documentId = newId('doc')
  const passages = splitPassages(content).map(p => ({ ...p, id: newId('psg') }))
  if (!passages.length) throw createError({ statusCode: 422, statusMessage: 'EMPTY_DOCUMENT', message: `${filename} has no text.` })

  tx(() => {
    db.prepare(`insert into documents (id, title, filename, kind, sha256, version, content, imported_at, project_id, origin, created_by)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(documentId, title, filename, kind, sha256, version, content, now(), projectId, written ? 'written' : 'import', access().user.id)
    const ins = db.prepare('insert into passages values (?, ?, ?, ?, ?, ?, ?)')
    for (const p of passages) ins.run(p.id, documentId, p.ordinal, p.start_line, p.end_line, p.text, projectId)
    const event = written ? (version > 1 ? 'document.version_written' : 'document.written') : (version > 1 ? 'document.version_added' : 'document.imported')
    audit(event, 'document', documentId, { filename, title, kind, version, sha256, passages: passages.length })
    // Old citations are not silently moved to the new version; they are flagged stale until someone reviews them.
    if (version > 1) {
      const stale = db.prepare(`select distinct f.id from facts f join evidence e on e.fact_id = f.id join documents d on d.id = e.document_id
        where f.project_id = ? and f.status = 'canon' and d.filename = ? and d.version < ?`).all(projectId, filename, version) as { id: string }[]
      if (stale.length) audit('citation.stale', 'document', documentId, { filename, version, fact_ids: stale.map(s => s.id) })
    }
  })

  // Extraction failing must not lose the import.
  let candidates = 0
  let unverified = 0
  let extractionError: string | null = null
  try {
    const drafts = await extractCandidates({ id: documentId, filename, title, text: content })
    const model = modelInfo()
    tx(() => {
      for (const c of drafts) {
        const match = findQuotePassage(passages, c.quote)
        const passage = match?.passage
        const tFrom = parseStoryTime(c.time?.from)
        const tTo = parseStoryTime(c.time?.to)
        const precision = c.time ? (c.time.precision ?? 'exact') : null
        const factId = newId('fact')
        db.prepare(`insert into facts (id, kind, subject, predicate, object, value, statement, t_from, t_to, time_label, precision,
          status, confidence, origin, model_id, created_at, project_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`)
          .run(factId, c.kind, c.subject, c.predicate, c.object ?? null, c.value == null ? null : String(c.value), c.statement, tFrom, tTo,
            timeLabel(tFrom, tTo, precision), precision, c.confidence ?? null, `model:${PROMPT_VERSIONS.extract}`, model.id, now(), projectId)
        db.prepare('insert into evidence (id, fact_id, document_id, passage_id, quote, verified, project_id) values (?, ?, ?, ?, ?, ?, ?)')
          .run(newId('ev'), factId, documentId, passage?.id ?? null, match?.quote ?? c.quote ?? '', passage ? 1 : 0, projectId)
        audit('candidate.created', 'fact', factId, { document_id: documentId, quote_verified: !!passage, model_id: model.id })
        candidates++
        if (!passage) unverified++
      }
    })
  } catch (e) {
    extractionError = (e as Error).message
    audit('job.failed', 'document', documentId, { step: 'extraction', error: extractionError })
  }

  return { filename, status: 'imported' as const, document_id: documentId, version, passages: passages.length, candidates, unverified, extraction_error: extractionError }
}
