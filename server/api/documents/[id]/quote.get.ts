// The quote Add fact / Add note would store for a selection, before anyone decides: the same findQuotePassage check the
// POSTs run (selected passage first), so the dialog shows exactly the stored characters. `widened` says the stored quote holds
// more words than were selected (a selection that cut an italic or bold phrase in half takes in the whole phrase).
// Read-only; 400 without one quote and one passage of this document; null when the words are not verbatim in one paragraph
// (the POST would refuse them too).
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const doc = useDb().prepare('select id from documents where id = ? and project_id = ?').get(getRouterParam(event, 'id') ?? '', pid()) as { id: string } | undefined
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Document not found.' })
  // One quote and one passage of this document, both as single query values (a repeated key arrives as an array).
  const selected = typeof q.quote === 'string' ? q.quote.trim() : ''
  if (!selected || selected.length > 20_000) throw createError({ statusCode: 400, statusMessage: 'BAD_QUOTE', message: 'Send the selected words as one quote of up to 20,000 characters.' })
  const passages = useDb().prepare('select * from passages where document_id = ? order by ordinal').all(doc.id) as unknown as PassageRow[]
  if (typeof q.passage_id !== 'string' || !passages.some(p => p.id === q.passage_id))
    throw createError({ statusCode: 400, statusMessage: 'BAD_PASSAGE', message: 'Send passage_id: the paragraph of this document the words were selected in.' })
  const match = findQuotePassage(passages, selected, q.passage_id)
  if (!match) return { quote: null, passage_id: null, widened: false }
  return { quote: match.quote, passage_id: match.passage.id, widened: foldQuoteText(match.quote).str.length > foldQuoteText(selected).str.length }
})
