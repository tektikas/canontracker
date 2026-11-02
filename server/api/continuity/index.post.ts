// Check a text against accepted canon (server/utils/continuity.ts). { text, passage_id? }. With passage_id the text is a
// selection from that passage of an imported document (it must be verbatim there); otherwise it is the writer's private draft,
// and only its author can read the run. Editors+ (the writer); everyone can run one from Ask. Limited by continuityThrottle.
export default defineEventHandler(async (event) => {
  const b = await readObject<{ text: string, passage_id: string }>(event)
  const text = optText(b.text, 'Text', MAX_CONTINUITY_CHARS)
  if (!text) throw createError({ statusCode: 400, statusMessage: 'TEXT_REQUIRED', message: 'Write or select some text to check.' })
  if (b.passage_id == null) {
    continuityThrottle()
    return runContinuity({ text, source: 'draft' })
  }
  const p = useDb().prepare(`select p.*, d.title from passages p join documents d on d.id = p.document_id where p.id = ? and p.project_id = ?`).get(idOf(b.passage_id), pid()) as unknown as (PassageRow & { title: string }) | undefined
  const match = p && findQuotePassage([p], text)
  if (!p || !match) throw createError({ statusCode: 422, statusMessage: 'NOT_IN_PASSAGE', message: 'The selected words are not in that passage.' })
  continuityThrottle()
  return runContinuity({ text: match.quote, source: 'passage', documentId: p.document_id, passageId: p.id, where: `from "${p.title}", lines ${p.start_line}-${p.end_line}` })
})
