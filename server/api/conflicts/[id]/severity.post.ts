// A person can change a conflict's severity, with a reason. Recorded in the audit trail; the rule's default is untouched.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readObject<{ severity: string, rationale: string }>(event)
  const severity = body.severity as string | undefined
  if (!SEVERITIES.includes(severity as Severity))
    throw createError({ statusCode: 400, statusMessage: 'BAD_SEVERITY', message: `severity must be one of ${SEVERITIES.join(', ')}` })
  const rationale = optText(body.rationale, 'Rationale', 2000)
  if (!rationale) throw createError({ statusCode: 400, statusMessage: 'RATIONALE_REQUIRED', message: 'Add a short reason.' })
  const db = useDb()
  const c = db.prepare('select severity from conflicts where id = ? and project_id = ?').get(id, pid()) as { severity: string } | undefined
  if (!c) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Conflict not found.' })
  if (c.severity === severity) throw createError({ statusCode: 409, statusMessage: 'INVALID_STATE_TRANSITION', message: `Already ${severity}.` })
  tx(() => {
    db.prepare('update conflicts set severity = ? where id = ?').run(severity!, id)
    audit('conflict.severity', 'conflict', id, { from: c.severity, to: severity, rationale: rationale })
  })
  return { id, severity }
})
