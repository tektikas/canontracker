// "Try the demo": one click makes a guest account (no email of its own, no usable password, users.guest = 1), a "Demo studio"
// it owns, signs it in like sign-up does, and gives it three sample projects. Unlike a normal demo load, these open with most
// canon preloaded as sample canon, a conflict scan run and the gold set's rule change proposed (server/utils/guest.ts), so every
// screen has data and Review keeps a short queue to decide. The projects are a copy of a template built once per server process
// (copyDemoProjects); if the template can't be built, this guest gets the full build instead (buildDemoProjects).
// Guests are never deleted (users never are). 20 per 10 minutes per IP.
const guests = fixedWindow(20, 600_000, 10_000)

export default defineEventHandler(async (event) => {
  const wait = guests(clientIp(event))
  if (wait) throw createError({ statusCode: 429, statusMessage: 'TOO_MANY_REQUESTS', message: `Too many demo accounts from this network. Try again in ${Math.ceil(wait / 60_000)} min.` })
  const started = Date.now()
  const db = useDb()
  const id = newId('usr')
  const user = { id, name: 'Guest', email: `guest-${id.slice(4).toLowerCase()}@demo.invalid` }
  const studio = { id: newId('std'), name: 'Demo studio' }
  // 'guest' is not a scrypt hash, so no password ever matches it (verifySecret).
  tx(() => {
    db.prepare(`insert into users (id, email, name, password_hash, created_at, guest) values (?, ?, ?, 'guest', ?, 1)`).run(id, user.email, user.name, now())
    db.prepare('insert into studios values (?, ?, ?, ?)').run(studio.id, studio.name, id, now())
    db.prepare(`insert into memberships values (?, ?, 'owner', ?)`).run(studio.id, id, now())
  })
  const copied = await guestTemplate().then(() => true, (e) => {
    console.error('[guest] demo template failed, building this guest in full:', e)
    return false
  })
  const projects = copied ? await copyDemoProjects(user, studio) : await buildDemoProjects(user, studio)
  const home = projects[0]!
  event.context.access = { user, project: db.prepare('select * from projects where id = ?').get(home.id) as unknown as ProjectRow, studio, role: 'owner' } satisfies Access
  audit('guest.created', 'user', id, { projects: projects.map(p => p.name), ms: Date.now() - started, copied })
  db.prepare('update users set last_project_id = ? where id = ?').run(home.id, id)
  await setUserSession(event, { user: { id }, projectId: home.id, loggedInAt: now() })
  return { id, project_id: home.id, projects }
})
