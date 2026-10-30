// Accepting a candidate into canon: one path for a single decision (facts/[id]/review) and for a bulk one (facts/accept-verified).

/** True when one of the candidate's quotes is verbatim in its cited passage (re-checked against the passage, not the stored flag alone). */
export function hasVerifiedQuote(factId: string) {
  const quotes = useDb().prepare(`select e.quote, p.text from evidence e join passages p on p.id = e.passage_id
    where e.fact_id = ? and e.verified = 1 and e.project_id = ?`).all(factId, pid()) as { quote: string, text: string }[]
  return quotes.some(e => isVerbatimQuote(e.text, e.quote))
}

/** Writes the canon row and its audit event. The caller checks the quote first and runs this inside tx(). */
export function acceptCandidate(fact: Fact, decision: 'accept' | 'correct_and_accept', corrected: { statement?: string, subject?: string, predicate?: string, object?: string | null } = {}, rationale: string | null = null, extra: Record<string, unknown> = {}) {
  const c = decision === 'correct_and_accept' ? corrected : {}
  const after = {
    statement: c.statement?.trim() || fact.statement,
    subject: c.subject?.trim() || fact.subject,
    predicate: c.predicate?.trim() || fact.predicate,
    object: c.object === undefined ? fact.object : (c.object?.trim() || null),
  }
  // A merge already decided these names are one page (the reviewer saw it on the candidate), so canon uses the kept name.
  const identity = identityOf(after)
  for (const i of identity) after[i.role] = i.to
  useDb().prepare(`update facts set status = 'canon', statement = ?, subject = ?, predicate = ?, object = ?, decided_at = ?, rationale = ?, decided_by = ? where id = ?`)
    .run(after.statement, after.subject, after.predicate, after.object, now(), rationale, access().user.id, fact.id)
  audit(decision === 'accept' ? 'candidate.accepted' : 'candidate.corrected_and_accepted', 'fact', fact.id, {
    rationale,
    before: { statement: fact.statement, subject: fact.subject, predicate: fact.predicate, object: fact.object },
    after,
    ...(identity.length && { identity: identity.map(i => ({ role: i.role, from: i.from, to: i.to, merge_audit_id: i.audit_id })) }),
    ...extra,
  })
  return after
}
