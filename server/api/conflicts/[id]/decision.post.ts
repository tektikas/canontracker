const DECISIONS = ['confirmed', 'false_positive', 'uncertain']

// A decision is recorded; it never edits canon. Fixing canon goes through a change proposal.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { decision, rationale } = await readBody<{ decision?: string, rationale?: string }>(event)
  if (!decision || !DECISIONS.includes(decision))
    throw createError({ statusCode: 400, statusMessage: 'BAD_DECISION', message: `decision must be one of ${DECISIONS.join(', ')}` })
  if (!rationale?.trim()) throw createError({ statusCode: 400, statusMessage: 'RATIONALE_REQUIRED', message: 'Add a short rationale.' })
  const db = useDb()
  const c = db.prepare('select status from conflicts where id = ?').get(id) as { status: string } | undefined
  if (!c) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Conflict not found.' })
  if (c.status !== 'open') throw createError({ statusCode: 409, statusMessage: 'INVALID_STATE_TRANSITION', message: `Already ${c.status}.` })
  tx(() => {
    db.prepare('update conflicts set status = ?, decided_at = ?, decision_rationale = ? where id = ?').run(decision, now(), rationale.trim(), id)
    audit(`conflict.${decision}`, 'conflict', id, { rationale: rationale.trim() })
  })
  return { id, status: decision }
})
