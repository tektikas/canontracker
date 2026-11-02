interface Body {
  decision: 'accept' | 'correct_and_accept' | 'reject'
  rationale?: string
  corrected?: { statement?: string, subject?: string, predicate?: string, object?: string | null }
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readObject<Body>(event)
  const fact = getFact(id)
  if (fact.status !== 'pending')
    throw createError({ statusCode: 409, statusMessage: 'INVALID_STATE_TRANSITION', message: `Candidate is already ${fact.status}.` })
  const rationale = optText(body.rationale, 'Rationale', 2000) || null
  const db = useDb()

  if (body.decision === 'reject') {
    if (!rationale) throw createError({ statusCode: 400, statusMessage: 'RATIONALE_REQUIRED', message: 'Say why the candidate is rejected.' })
    tx(() => {
      db.prepare(`update facts set status = 'rejected', decided_at = ?, rationale = ?, decided_by = ? where id = ?`).run(now(), rationale, access().user.id, id)
      audit('candidate.rejected', 'fact', id, { rationale, statement: fact.statement })
    })
    return { id, status: 'rejected' }
  }

  if (body.decision !== 'accept' && body.decision !== 'correct_and_accept')
    throw createError({ statusCode: 400, statusMessage: 'BAD_DECISION', message: 'decision must be accept, correct_and_accept or reject.' })
  if (!hasVerifiedQuote(id)) {
    audit('candidate.accept_refused', 'fact', id, { reason: 'no_valid_evidence' })
    throw createError({ statusCode: 422, statusMessage: 'UNVERIFIED_EVIDENCE', message: 'The quote was not found verbatim in the source, so this cannot become canon.' })
  }
  // A correction: each field optional text, capped like a hand-added fact (POST /api/facts); object may be null (no object).
  const c = body.corrected ?? {}
  if (typeof c !== 'object' || Array.isArray(c)) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'corrected must be an object.' })
  const field = (k: 'statement' | 'subject' | 'predicate' | 'object', max: number) => {
    const v = (c as Record<string, unknown>)[k]
    return v === undefined ? undefined : k === 'object' && v === null ? null : optText(v, k, max)
  }
  const corrected = { statement: field('statement', 500), subject: field('subject', 80), predicate: field('predicate', 60), object: field('object', 80) }
  tx(() => acceptCandidate(fact, body.decision as 'accept' | 'correct_and_accept', corrected as Body['corrected'], rationale))
  return { id, status: 'canon' }
})
