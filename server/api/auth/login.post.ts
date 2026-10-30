export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string, password?: string }>(event)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const user = useDb().prepare('select * from users where email = ?').get(email) as unknown as UserRow | undefined
  if (!user || typeof body.password !== 'string' || !verifySecret(user.password_hash, body.password))
    throw createError({ statusCode: 401, statusMessage: 'BAD_CREDENTIALS', message: 'That email and password don’t match an account.' })
  // Reopen the project they last worked in, if they still have access to it.
  const projects = projectsFor(user.id)
  const project = projects.find(p => p.id === user.last_project_id) ?? projects[0]
  await setUserSession(event, { user: { id: user.id }, projectId: project?.id ?? null, loggedInAt: now() })
  return { id: user.id, project_id: project?.id ?? null }
})
