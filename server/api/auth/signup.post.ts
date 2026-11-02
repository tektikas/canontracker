export default defineEventHandler(async (event) => {
  const body = await readObject<{ name?: string, email?: string, password?: string }>(event)
  const name = cleanName(body.name, 'name')
  const email = cleanEmail(body.email)
  if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD)
    throw createError({ statusCode: 400, statusMessage: 'WEAK_PASSWORD', message: `Use at least ${MIN_PASSWORD} characters for your password.` })
  const db = useDb()
  if (db.prepare('select 1 from users where email = ?').get(email))
    throw createError({ statusCode: 409, statusMessage: 'EMAIL_TAKEN', message: 'An account with this email already exists. Log in instead.' })
  const id = newId('usr')
  db.prepare('insert into users (id, email, name, password_hash, created_at) values (?, ?, ?, ?, ?)').run(id, email, name, hashSecret(body.password), now())
  await setUserSession(event, { user: { id }, projectId: null, loggedInAt: now() })
  return { id, name, email }
})
