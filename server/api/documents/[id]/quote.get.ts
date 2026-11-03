// The quote Add fact / Add note would store for a selection, before anyone decides: the same findQuotePassage check the
// POSTs run (selected passage first), so the dialog shows exactly the stored characters. `widened` says the stored quote holds
// more words than were selected (a selection that cut an italic or bold phrase in half takes in the whole phrase).
// Read-only; null when the words are not verbatim in one paragraph (the POST would refuse them too).
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const doc = useDb().prepare('select id from documents where id = ? and project_id = ?').get(getRouterParam(event, 'id') ?? '', pid()) as { id: string } | undefined
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Document not found.' })
  const selected = typeof q.quote === 'string' ? q.quote.trim().slice(0, 20_000) : ''
  const passages = useDb().prepare('select * from passages where document_id = ? order by ordinal').all(doc.id) as unknown as PassageRow[]
  const match = findQuotePassage(passages, selected, typeof q.passage_id === 'string' ? q.passage_id : null)
  if (!match) return { quote: null, passage_id: null, widened: false }
  return { quote: match.quote, passage_id: match.passage.id, widened: foldQuoteText(match.quote).str.length > foldQuoteText(selected).str.length }
})
