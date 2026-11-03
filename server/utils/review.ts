// Accepting a candidate into canon: one path for a single decision (facts/[id]/review) and for a bulk one (facts/accept-verified).

/** True when one of the candidate's quotes is verbatim in its cited passage (re-checked against the passage, not the stored flag alone). */
export function hasVerifiedQuote(factId: string) {
  const quotes = useDb().prepare(`select e.quote, p.text from evidence e join passages p on p.id = e.passage_id
    where e.fact_id = ? and e.verified = 1 and e.project_id = ?`).all(factId, pid()) as { quote: string, text: string }[]
  return quotes.some(e => isVerbatimQuote(e.text, e.quote))
}

/** Writes the canon row and its audit event. The caller checks the quote first and runs this inside tx(). `corrected.time`, when
 * given, replaces the story time (parsed by the caller); otherwise the candidate's time stays. */
export interface StoryTimeFields { t_from: number | null, t_to: number | null, time_label: string | null, precision: string | null }
export function acceptCandidate(fact: Fact, decision: 'accept' | 'correct_and_accept', corrected: { statement?: string, subject?: string, predicate?: string, object?: string | null, value?: string, time?: StoryTimeFields } = {}, rationale: string | null = null, extra: Record<string, unknown> = {}) {
  const c = decision === 'correct_and_accept' ? corrected : {}
  // A detail's answer (shared/utils/detail.ts) is stored as its value. A corrected answer, sent as the object (the Review form's
  // Answer box) or as value, replaces the candidate's: conflicts then check the edited answer.
  const typed = c.object !== undefined ? c.object : c.value
  const { value, ...after } = asDetail({
    statement: c.statement?.trim() || fact.statement,
    subject: c.subject?.trim() || fact.subject,
    predicate: c.predicate?.trim() || fact.predicate,
    object: typed === undefined ? fact.object : (typed?.trim() || null),
    value: fact.value,
  })
  const time = c.time ?? { t_from: fact.t_from, t_to: fact.t_to, time_label: fact.time_label, precision: fact.precision }
  // A merge already decided these names are one page (the reviewer saw it on the candidate), so canon uses the kept name.
  const identity = identityOf(after)
  for (const i of identity) after[i.role] = i.to
  useDb().prepare(`update facts set status = 'canon', statement = ?, subject = ?, predicate = ?, object = ?, value = ?, t_from = ?, t_to = ?, time_label = ?, precision = ?,
    decided_at = ?, rationale = ?, decided_by = ?, decided_token = ? where id = ?`)
    .run(after.statement, after.subject, after.predicate, after.object, value ?? null, time.t_from, time.t_to, time.time_label, time.precision, now(), rationale, access().user.id, agentToken(), fact.id)
  const retimed = time.time_label !== fact.time_label
  audit(decision === 'accept' ? 'candidate.accepted' : 'candidate.corrected_and_accepted', 'fact', fact.id, {
    rationale,
    before: { statement: fact.statement, subject: fact.subject, predicate: fact.predicate, object: fact.object, ...(retimed && { time: fact.time_label }) },
    after: { ...after, ...(retimed && { time: time.time_label }), ...(value !== fact.value && { value }) },
    ...(identity.length && { identity: identity.map(i => ({ role: i.role, from: i.from, to: i.to, merge_audit_id: i.audit_id })) }),
    ...extra,
  })
  return after
}
