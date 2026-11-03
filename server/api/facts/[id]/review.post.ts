interface Body {
  decision: 'accept' | 'correct_and_accept' | 'reject'
  rationale?: string
  // time_from / time_to: story time like "D2 14:30" or a whole day "D2" (both empty = no time); sent only to change it.
  // value: a detail's answer ("<detail>_is"); the object box is read the same way for a detail.
  corrected?: { statement?: string, subject?: string, predicate?: string, object?: string | null, value?: string, time_from?: string, time_to?: string, precision?: string }
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
      db.prepare(`update facts set status = 'rejected', decided_at = ?, rationale = ?, decided_by = ?, decided_token = ? where id = ?`).run(now(), rationale, access().user.id, agentToken(), id)
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
  const field = (k: 'statement' | 'subject' | 'predicate' | 'object' | 'value', max: number) => {
    const v = (c as Record<string, unknown>)[k]
    return v === undefined ? undefined : k === 'object' && v === null ? null : optText(v, k, max)
  }
  const corrected = { statement: field('statement', 500), subject: field('subject', 80), predicate: field('predicate', 60), object: field('object', 80), value: field('value', 200) ?? undefined } as Body['corrected'] & { time?: StoryTimeFields }
  const { time_from, time_to, precision } = c as Record<string, unknown>
  if (time_from !== undefined || time_to !== undefined) {
    const range = parseStoryRange(optText(time_from, 'From', 40), optText(time_to, 'Until', 40))
    if (range.bad) throw createError({ statusCode: 400, statusMessage: 'BAD_TIME', message: 'Story time must be like D2 14:30, or a whole day like D-3650.' })
    if (range.from != null && range.to != null && range.to < range.from) throw createError({ statusCode: 400, statusMessage: 'BAD_TIME', message: 'Until must be after From.' })
    const p = range.from == null && range.to == null ? null : precision === 'approximate' ? 'approximate' : 'exact'
    corrected.time = { t_from: range.from, t_to: range.to, time_label: timeLabel(range.from, range.to, p, range.day), precision: p }
  }
  tx(() => acceptCandidate(fact, body.decision as 'accept' | 'correct_and_accept', corrected, rationale))
  return { id, status: 'canon' }
})
