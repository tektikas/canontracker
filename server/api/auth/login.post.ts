// Failed logins only: 10 per 5 minutes per email, 30 per 5 minutes per IP (server/utils/throttle.ts). Over either, every
// login for it waits until the window ends; a successful login doesn't count.
const byEmail = fixedWindow(10, 300_000, 10_000)
const byIp = fixedWindow(30, 300_000, 10_000)

export default defineEventHandler(async (event) => {
  const body = await readObject<{ email?: string, password?: string }>(event)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const ip = clientIp(event)
  const wait = Math.max(byEmail(email, false), byIp(ip, false))
  if (wait) throw createError({ statusCode: 429, statusMessage: 'TOO_MANY_REQUESTS', message: `Too many failed log-ins. Try again in ${Math.ceil(wait / 60_000)} min.` })
  const user = useDb().prepare('select * from users where email = ?').get(email) as unknown as UserRow | undefined
  if (!user || typeof body.password !== 'string' || !verifySecret(user.password_hash, body.password)) {
    byEmail(email)
    byIp(ip)
    throw createError({ statusCode: 401, statusMessage: 'BAD_CREDENTIALS', message: 'That email and password don’t match an account.' })
  }
  // Reopen the project they last worked in, if they still have access to it.
  const projects = projectsFor(user.id)
  const project = projects.find(p => p.id === user.last_project_id) ?? projects[0]
  await setUserSession(event, { user: { id: user.id }, projectId: project?.id ?? null, loggedInAt: now() })
  return { id: user.id, project_id: project?.id ?? null }
})
