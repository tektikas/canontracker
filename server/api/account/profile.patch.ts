// Changes the signed-in person's own name and email. Always the caller's own row; there is no user id in the request.
export default defineEventHandler(async (event) => {
  const { user, session } = await requireUser(event)
  const body = await readBody<{ name?: string, email?: string }>(event)
  const name = cleanName(body.name, 'name')
  const email = cleanEmail(body.email)
  const db = useDb()
  if (email !== user.email && db.prepare('select 1 from users where email = ? and id != ?').get(email, user.id))
    throw createError({ statusCode: 409, statusMessage: 'EMAIL_TAKEN', message: 'Another account already uses this email.' })
  if (name === user.name && email === user.email) return { id: user.id, name, email }
  db.prepare('update users set name = ?, email = ? where id = ?').run(name, email, user.id)
  const detail: Record<string, unknown> = {}
  if (name !== user.name) detail.name = { from: user.name, to: name }
  if (email !== user.email) detail.email = { from: user.email, to: email }
  auditAccount(user.id, (session as { projectId?: string }).projectId, 'account.profile_updated', detail)
  return { id: user.id, name, email }
})
