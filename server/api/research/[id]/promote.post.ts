import { createHash } from 'node:crypto'
import type { ResearchNote } from '../../../utils/research'

// Promote a research note to a world rule or a fact candidate. Never canon: it makes a PENDING candidate a person reviews
// like any other. Its evidence is a read-only basis document holding the note as written (made on first promote, in the
// Library's "Research" folder); the quote must be words from it, checked with findQuotePassage like every quote.
// origin = research:<note id> links the candidate (and, once accepted, the canon fact) back to the note.
const KINDS = ['rule', 'event', 'claim', 'character', 'location', 'relationship']
const fail = (statusCode: number, statusMessage: string, message: string) => createError({ statusCode, statusMessage, message })

function basisDocument(note: ResearchNote) {
  const db = useDb()
  if (note.document_id) {
    const doc = db.prepare('select id from documents where id = ? and project_id = ?').get(note.document_id, pid()) as { id: string } | undefined
    if (doc) return doc.id
  }
  const content = researchDocumentText(note)
  const user = access().user.id
  let folder = db.prepare(`select id from folders where project_id = ? and name = 'Research' and parent_id is null`).get(pid()) as { id: string } | undefined
  if (!folder) {
    folder = { id: newId('fld') }
    db.prepare('insert into folders (id, name, parent_id, created_by, created_at, project_id) values (?, ?, null, ?, ?, ?)').run(folder.id, 'Research', user, now(), pid())
    audit('folder.created', 'folder', folder.id, { name: 'Research', parent: null })
  }
  const id = newId('doc')
  const name = `research-${note.id}.md`
  const title = `Research: ${note.question.length > 90 ? `${note.question.slice(0, 89)}…` : note.question}`
  const passages = splitPassages(content).map(p => ({ ...p, id: newId('psg') }))
  db.prepare(`insert into documents (id, title, filename, name, kind, sha256, version, content, imported_at, project_id, origin, created_by, folder_id)
    values (?, ?, ?, ?, 'other', ?, 1, ?, ?, ?, 'research', ?, ?)`).run(id, title, name, name, createHash('sha256').update(content).digest('hex'), content, now(), pid(), user, folder.id)
  const ins = db.prepare('insert into passages (id, document_id, ordinal, start_line, end_line, text, project_id) values (?, ?, ?, ?, ?, ?, ?)')
  for (const p of passages) ins.run(p.id, id, p.ordinal, p.start_line, p.end_line, p.text, pid())
  db.prepare('update research_notes set document_id = ? where id = ?').run(id, note.id)
  audit('document.research_saved', 'document', id, { filename: name, title, research_note_id: note.id, passages: passages.length, folder: 'Research' })
  return id
}

export default defineEventHandler(async (event) => {
  const note = getResearchNote(getRouterParam(event, 'id')!)
  const b = await readObject<Record<string, unknown>>(event)
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
  const as = b.as === 'rule' ? 'rule' : b.as === 'fact' ? 'fact' : null
  if (!as) throw fail(400, 'BAD_TARGET', 'as must be rule or fact.')
  const kind = as === 'rule' ? 'rule' : str(b.kind, 20) || 'claim'
  if (!KINDS.includes(kind)) throw fail(400, 'BAD_KIND', `kind must be one of ${KINDS.join(', ')}.`)
  const subject = str(b.subject, 80)
  const object = str(b.object, 80) || null
  const statement = str(b.statement, 500)
  const predicate = as === 'rule' ? 'rule' : str(b.predicate, 60).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '')
  if (!subject) throw fail(400, 'SUBJECT_REQUIRED', as === 'rule' ? 'Say what the rule is about.' : 'Say who or what the fact is about.')
  if (!predicate) throw fail(400, 'PREDICATE_REQUIRED', 'Say how they relate, for example died_at.')
  if (!statement) throw fail(400, 'STATEMENT_REQUIRED', 'Write it as one sentence.')
  const range = parseStoryRange(str(b.time_from, 40), str(b.time_to, 40))
  if (range.bad) throw fail(400, 'BAD_TIME', 'Story time must be like D2 14:30, or a whole day like D-3650.')
  const { from: tFrom, to: tTo, day } = range
  if (tFrom != null && tTo != null && tTo < tFrom) throw fail(400, 'BAD_TIME', 'To must be after From.')
  const precision = tFrom == null && tTo == null ? null : b.precision === 'approximate' ? 'approximate' : 'exact'
  const quote = typeof b.quote === 'string' ? b.quote.trim() : ''
  if (!quote) throw fail(422, 'QUOTE_REQUIRED', 'Pick the words in the research note that back it.')

  const db = useDb()
  const factId = newId('fact')
  return tx(() => {
    const docId = basisDocument(note)
    const passages = db.prepare('select id, text from passages where document_id = ? order by ordinal').all(docId) as { id: string, text: string }[]
    const match = findQuotePassage(passages, quote)
    // Throwing rolls the transaction back, so a refused promote leaves no basis document behind either.
    if (!match) throw fail(422, 'UNVERIFIED_EVIDENCE', `The quote must be words from the research note (its answer, a claim or a source quote), at least ${MIN_QUOTE_CHARS} characters, within one paragraph.`)
    db.prepare(`insert into facts (id, kind, subject, predicate, object, value, statement, t_from, t_to, time_label, precision, status, confidence,
      origin, model_id, created_at, created_by, project_id) values (?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, 'pending', null, ?, ?, ?, ?, ?)`)
      .run(factId, kind, subject, predicate, object, statement, tFrom, tTo, timeLabel(tFrom, tTo, precision, day), precision, `research:${note.id}`, note.model_id, now(), access().user.id, pid())
    db.prepare('insert into evidence (id, fact_id, document_id, passage_id, quote, verified, project_id) values (?, ?, ?, ?, ?, 1, ?)')
      .run(newId('ev'), factId, docId, match.passage.id, match.quote, pid())
    audit('candidate.created', 'fact', factId, { document_id: docId, quote_verified: true, research_note_id: note.id, statement })
    audit('research.promoted', 'research_note', note.id, { as, fact_id: factId, statement, quote: match.quote })
    return { id: factId, status: 'pending', document_id: docId }
  })
})
