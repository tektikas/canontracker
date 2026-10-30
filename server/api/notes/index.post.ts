// A note pinned to a passage. Editorial only: never canon, never read by conflicts or impact.
export default defineEventHandler(async (event) => {
  const b = (await readBody<Record<string, unknown>>(event)) ?? {}
  const db = useDb()
  const doc = db.prepare('select id from documents where id = ? and project_id = ?').get(String(b.document_id ?? ''), pid()) as { id: string } | undefined
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Document not found.' })
  const passages = db.prepare('select id, text from passages where document_id = ?').all(doc.id) as { id: string, text: string }[]
  const quote = typeof b.quote === 'string' ? b.quote.trim() : ''
  // The note is pinned to the selected words when they are in the passage; otherwise to the passage as a whole.
  const passage = findQuotePassage(passages, quote, String(b.passage_id ?? ''))?.passage ?? passages.find(p => p.id === b.passage_id)
  if (!passage) throw createError({ statusCode: 400, statusMessage: 'BAD_PASSAGE', message: 'Pick the passage the note is about.' })
  const body = typeof b.body === 'string' ? b.body.trim() : ''
  if (!body) throw createError({ statusCode: 400, statusMessage: 'BODY_REQUIRED', message: 'Write the note.' })
  if (body.length > 4000) throw createError({ statusCode: 400, statusMessage: 'TOO_LONG', message: 'Keep a note under 4,000 characters.' })
  const id = newId('note')
  const user = access().user.id
  tx(() => {
    db.prepare(`insert into notes (id, document_id, passage_id, quote, body, status, created_by, created_at, updated_at, project_id)
      values (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`).run(id, doc.id, passage.id, passage.text.includes(quote) ? quote : '', body, user, now(), now(), pid())
    audit('note.created', 'note', id, { document_id: doc.id, passage_id: passage.id, quote, body })
  })
  return getNote(id)
})
