// Changes the signed-in person's own password. Needs the current one. The audit event never carries either password.
export default defineEventHandler(async (event) => {
  const { user, session } = await requireUser(event)
  const body = await readBody<{ current?: string, next?: string }>(event)
  if (typeof body.current !== 'string' || !verifySecret(user.password_hash, body.current))
    throw createError({ statusCode: 403, statusMessage: 'WRONG_PASSWORD', message: 'Your current password isn’t right.' })
  if (typeof body.next !== 'string' || body.next.length < MIN_PASSWORD)
    throw createError({ statusCode: 400, statusMessage: 'WEAK_PASSWORD', message: `Use at least ${MIN_PASSWORD} characters for your new password.` })
  if (body.next === body.current)
    throw createError({ statusCode: 400, statusMessage: 'SAME_PASSWORD', message: 'Pick a password different from your current one.' })
  useDb().prepare('update users set password_hash = ? where id = ?').run(hashSecret(body.next), user.id)
  auditAccount(user.id, (session as { projectId?: string }).projectId, 'account.password_changed')
  return { ok: true }
})
