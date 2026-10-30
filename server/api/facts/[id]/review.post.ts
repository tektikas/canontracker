interface Body {
  decision: 'accept' | 'correct_and_accept' | 'reject'
  rationale?: string
  corrected?: { statement?: string, subject?: string, predicate?: string, object?: string | null }
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody<Body>(event)
  const fact = getFact(id)
  if (fact.status !== 'pending')
    throw createError({ statusCode: 409, statusMessage: 'INVALID_STATE_TRANSITION', message: `Candidate is already ${fact.status}.` })
  const rationale = body.rationale?.trim() || null
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
  const quotes = db.prepare(`select e.quote, p.text from evidence e join passages p on p.id = e.passage_id
    where e.fact_id = ? and e.verified = 1 and e.project_id = ?`).all(id, pid()) as { quote: string, text: string }[]
  // Re-verify against the cited passage's text (not the quote against itself): blank, short, padded or non-verbatim quotes are not evidence.
  if (!quotes.some(e => isVerbatimQuote(e.text, e.quote))) {
    audit('candidate.accept_refused', 'fact', id, { reason: 'no_valid_evidence' })
    throw createError({ statusCode: 422, statusMessage: 'UNVERIFIED_EVIDENCE', message: 'The quote was not found verbatim in the source, so this cannot become canon.' })
  }

  const c = body.decision === 'correct_and_accept' ? body.corrected ?? {} : {}
  const after = {
    statement: c.statement?.trim() || fact.statement,
    subject: c.subject?.trim() || fact.subject,
    predicate: c.predicate?.trim() || fact.predicate,
    object: c.object === undefined ? fact.object : (c.object?.trim() || null),
  }
  tx(() => {
    db.prepare(`update facts set status = 'canon', statement = ?, subject = ?, predicate = ?, object = ?, decided_at = ?, rationale = ?, decided_by = ? where id = ?`)
      .run(after.statement, after.subject, after.predicate, after.object, now(), rationale, access().user.id, id)
    audit(body.decision === 'accept' ? 'candidate.accepted' : 'candidate.corrected_and_accepted', 'fact', id, {
      rationale,
      before: { statement: fact.statement, subject: fact.subject, predicate: fact.predicate, object: fact.object },
      after,
    })
  })
  return { id, status: 'canon' }
})
