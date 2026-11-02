// A person re-checks canon citations that point at an older version of their source (server/utils/recheck.ts). The client
// sends what it showed; each is re-classified now, so only what is still true is done and the rest is named as skipped.
//   confirm (fact_ids):  citations whose quote reads the same, exactly once, in the latest version now cite that version's
//                        passage, holding the quote as that version writes it
//                        (new_quote in the audit when its typography changed). One citation.confirmed per fact.
//   keep (evidence_ids): each named outdated citation stays on its old version, marked as checked against the latest one.
//                        Citation by citation: keeping one source of a fact says nothing about its others. One citation.kept
//                        per citation.
// Audit details carry the quote and both versions. Canon statements never change.
const MAX = 500

export default defineEventHandler(async (event) => {
  requireRole('editor')
  const body = await readBody<{ action?: unknown, fact_ids?: unknown, evidence_ids?: unknown }>(event)
  const action = body?.action
  if (action !== 'confirm' && action !== 'keep') throw createError({ statusCode: 400, statusMessage: 'BAD_ACTION', message: 'action must be confirm or keep.' })
  const field = action === 'confirm' ? 'fact_ids' : 'evidence_ids'
  const ids = body?.[field]
  if (!Array.isArray(ids) || !ids.length || !ids.every(x => typeof x === 'string'))
    throw createError({ statusCode: 400, statusMessage: 'IDS_REQUIRED', message: action === 'confirm' ? 'Send the facts you showed as fact_ids.' : 'Send the citations you kept as evidence_ids.' })
  if (ids.length > MAX) throw createError({ statusCode: 400, statusMessage: 'TOO_MANY', message: `Re-check at most ${MAX} at once.` })

  const db = useDb()
  const nameOf = db.prepare('select name from documents where id = ?')
  const fromOf = (c: StaleCitation) => ({ document_id: c.document_id, version: c.version, passage_id: c.passage_id, line: c.start_line })
  const filenameOf = (c: StaleCitation) => (nameOf.get(c.latest_id) as { name: string }).name
  const done: string[] = []
  const skipped: { id: string, reason: 'nothing_to_do' }[] = []
  return tx(() => {
    const citations = staleCanonCitations()
    if (action === 'keep') {
      const outdated = new Map(citations.filter(c => c.state === 'outdated').map(c => [c.evidence_id, c]))
      for (const id of new Set(ids as string[])) {
        const c = outdated.get(id)
        if (!c) {
          skipped.push({ id, reason: 'nothing_to_do' })
          continue
        }
        db.prepare('update evidence set checked_version = ? where id = ?').run(c.latest_version, c.evidence_id)
        audit('citation.kept', 'fact', c.fact_id, { citations: [{ evidence_id: c.evidence_id, filename: filenameOf(c), quote: c.quote, from: fromOf(c), checked_against: { document_id: c.latest_id, version: c.latest_version }, quote_count: c.count }] })
        done.push(id)
      }
      return { action, done, skipped }
    }
    const byFact = new Map<string, StaleCitation[]>()
    for (const c of citations) if (c.state === 'unchanged') byFact.set(c.fact_id, [...(byFact.get(c.fact_id) ?? []), c])
    for (const id of new Set(ids as string[])) {
      const cs = byFact.get(id)
      if (!cs) {
        skipped.push({ id, reason: 'nothing_to_do' })
        continue
      }
      audit('citation.confirmed', 'fact', id, { citations: cs.map((c) => {
        db.prepare('update evidence set document_id = ?, passage_id = ?, quote = ?, checked_version = null where id = ?').run(c.latest_id, c.to!.passage_id, c.to!.quote, c.evidence_id)
        return { evidence_id: c.evidence_id, filename: filenameOf(c), quote: c.quote, ...(c.to!.quote !== c.quote && { new_quote: c.to!.quote }), from: fromOf(c), to: { document_id: c.latest_id, version: c.latest_version, passage_id: c.to!.passage_id, line: c.to!.start_line } }
      }) })
      done.push(id)
    }
    return { action, done, skipped }
  })
})
