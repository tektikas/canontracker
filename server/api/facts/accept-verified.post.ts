// Accept a list of candidates in one human decision. The client sends exactly the candidates it showed the person in the
// confirmation sheet; only those still pending and with a quote verbatim in their source become canon. The rest are skipped
// and named (already decided, quote not found, not in this project). Each accepted candidate gets its own audit event with
// the actor, plus one summary event for the decision. Sending the same list again accepts nothing new.
const MAX = 500

export default defineEventHandler(async (event) => {
  requireRole('editor')
  const body = await readBody<{ ids?: unknown }>(event)
  const ids = body?.ids
  if (!Array.isArray(ids) || !ids.length || !ids.every(x => typeof x === 'string'))
    throw createError({ statusCode: 400, statusMessage: 'IDS_REQUIRED', message: 'Send the candidates to accept as ids: [...].' })
  if (ids.length > MAX) throw createError({ statusCode: 400, statusMessage: 'TOO_MANY', message: `Accept at most ${MAX} candidates at once.` })

  const db = useDb()
  const batch = newId('bulk')
  const accepted: string[] = []
  const skipped: { id: string, reason: 'not_found' | 'already_decided' | 'unverified' }[] = []
  tx(() => {
    for (const id of new Set(ids as string[])) {
      const fact = db.prepare('select * from facts where id = ? and project_id = ?').get(id, pid()) as unknown as Fact | undefined
      if (!fact) skipped.push({ id, reason: 'not_found' })
      else if (fact.status !== 'pending') skipped.push({ id, reason: 'already_decided' })
      else if (!hasVerifiedQuote(id)) skipped.push({ id, reason: 'unverified' })
      else {
        acceptCandidate(fact, 'accept', {}, null, { bulk: batch })
        accepted.push(id)
      }
    }
    if (accepted.length) audit('candidate.bulk_accepted', 'project', pid(), { batch, accepted, skipped })
  })
  return { accepted, skipped }
})
