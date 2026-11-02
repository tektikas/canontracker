// A person re-checks canon citations that point at an older version of their source (server/utils/recheck.ts). The client
// sends the facts it showed; each is re-classified now, so only what is still true is done and the rest is named as skipped.
//   confirm: citations whose quote reads the same, exactly once, in the latest version now cite that version's passage.
//   keep:    citations whose quote is gone stay on the old version, marked as checked against the latest one.
// One audit event per fact (citation.confirmed / citation.kept) with the quote and both versions. Canon statements never change.
const MAX = 500

export default defineEventHandler(async (event) => {
  requireRole('editor')
  const body = await readBody<{ action?: unknown, fact_ids?: unknown }>(event)
  const action = body?.action
  const ids = body?.fact_ids
  if (action !== 'confirm' && action !== 'keep') throw createError({ statusCode: 400, statusMessage: 'BAD_ACTION', message: 'action must be confirm or keep.' })
  if (!Array.isArray(ids) || !ids.length || !ids.every(x => typeof x === 'string'))
    throw createError({ statusCode: 400, statusMessage: 'FACTS_REQUIRED', message: 'Send the facts you showed as fact_ids.' })
  if (ids.length > MAX) throw createError({ statusCode: 400, statusMessage: 'TOO_MANY', message: `Re-check at most ${MAX} facts at once.` })

  const db = useDb()
  const want = action === 'confirm' ? 'unchanged' : 'outdated'
  const nameOf = db.prepare('select name from documents where id = ?')
  const done: string[] = []
  const skipped: { id: string, reason: 'nothing_to_do' }[] = []
  return tx(() => {
    const byFact = new Map<string, StaleCitation[]>()
    for (const c of staleCanonCitations()) if (c.state === want) byFact.set(c.fact_id, [...(byFact.get(c.fact_id) ?? []), c])
    for (const id of new Set(ids as string[])) {
      const cs = byFact.get(id)
      if (!cs) {
        skipped.push({ id, reason: 'nothing_to_do' })
        continue
      }
      const citations = cs.map((c) => {
        const filename = (nameOf.get(c.latest_id) as { name: string }).name
        const from = { document_id: c.document_id, version: c.version, passage_id: c.passage_id, line: c.start_line }
        if (action === 'confirm') {
          db.prepare('update evidence set document_id = ?, passage_id = ?, checked_version = null where id = ?').run(c.latest_id, c.to!.passage_id, c.evidence_id)
          return { evidence_id: c.evidence_id, filename, quote: c.quote, from, to: { document_id: c.latest_id, version: c.latest_version, passage_id: c.to!.passage_id, line: c.to!.start_line } }
        }
        db.prepare('update evidence set checked_version = ? where id = ?').run(c.latest_version, c.evidence_id)
        return { evidence_id: c.evidence_id, filename, quote: c.quote, from, checked_against: { document_id: c.latest_id, version: c.latest_version } }
      })
      audit(action === 'confirm' ? 'citation.confirmed' : 'citation.kept', 'fact', id, { citations })
      done.push(id)
    }
    return { action, done, skipped }
  })
})
