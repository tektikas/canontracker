// Pin a research note to the story passage it is about (like a note), or unpin it (pin: null). Editorial: never canon.
export default defineEventHandler(async (event) => {
  const note = getResearchNote(getRouterParam(event, 'id')!)
  const b = await readObject<{ pin: unknown }>(event)
  if (!('pin' in b)) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'Send pin: { document_id, quote } or pin: null.' })
  const db = useDb()
  if (b.pin === null) {
    tx(() => {
      db.prepare('update research_notes set pin_document_id = null, pin_passage_id = null, pin_quote = null, pinned_by = null, pinned_at = null where id = ?').run(note.id)
      audit('research.unpinned', 'research_note', note.id, { document_id: note.pin_document_id, passage_id: note.pin_passage_id })
    })
    return getResearchNote(note.id)
  }
  const pin = (b.pin && typeof b.pin === 'object' ? b.pin : {}) as Record<string, unknown>
  const doc = db.prepare('select id, filename, version from documents where id = ? and project_id = ?').get(String(pin.document_id ?? ''), pid()) as { id: string, filename: string, version: number } | undefined
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Document not found.' })
  const latest = latestDocument(doc.filename)!
  if (latest.id !== doc.id) throw createError({ statusCode: 409, statusMessage: 'OLD_VERSION', message: `This is v${doc.version}; pin to the latest version (v${latest.version}) instead.` })
  // Pinned to the selected words, which must be in the document (in the passage picked, when one is sent).
  const passageId = typeof pin.passage_id === 'string' ? pin.passage_id : null
  const passages = (db.prepare('select id, text from passages where document_id = ? order by ordinal').all(doc.id) as { id: string, text: string }[])
    .filter(p => !passageId || p.id === passageId)
  const match = findQuotePassage(passages, typeof pin.quote === 'string' ? pin.quote : '')
  if (!match) throw createError({ statusCode: 422, statusMessage: 'BAD_PASSAGE', message: `Those words are not in ${passageId ? 'that passage' : 'the document'}. Copy a phrase (at least ${MIN_QUOTE_CHARS} characters) from the passage the note is about.` })
  const { passage, quote: stored } = match
  tx(() => {
    db.prepare('update research_notes set pin_document_id = ?, pin_passage_id = ?, pin_quote = ?, pinned_by = ?, pinned_at = ? where id = ?')
      .run(doc.id, passage.id, stored, access().user.id, now(), note.id)
    audit('research.pinned', 'research_note', note.id, { document_id: doc.id, passage_id: passage.id, quote: stored })
  })
  return getResearchNote(note.id)
})
