import { loadSample, type SampleSet } from '../demo/load.post'

// "Try the demo": one click makes a guest account (no email of its own, no usable password, users.guest = 1), a "Demo studio"
// it owns, signs it in like sign-up does, and loads three samples into their own projects, each through the demo load's own
// code (loadSample). Unlike a normal demo load, these open with most canon preloaded as sample canon, a conflict scan run and
// the gold set's rule change proposed (server/utils/guest.ts), so every screen has data and Review keeps a short queue to decide.
// Guests are never deleted (users never are). 20 per 10 minutes per IP: each one loads ~60 documents.
const guests = fixedWindow(20, 600_000, 10_000)
const PROJECTS: [SampleSet, string][] = [['broken-tide', 'Broken Tide (demo)'], ['ashbell-pass', 'The Ashbell Pass (demo)'], ['sherlock-holmes', 'Sherlock Holmes (demo)']]

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
  // Each sample loads inside its own project, set up the way the project guard sets up a request (access()), replaying its
  // recording even on a live server (sampleReplay), so no model call is made.
  event.context.sampleReplay = true
  const enter = (projectId: string) => {
    event.context.access = { user, project: db.prepare('select * from projects where id = ?').get(projectId) as unknown as ProjectRow, studio, role: 'owner' } satisfies Access
  }
  const projects: { id: string, name: string, set: SampleSet }[] = []
  for (const [set, name] of PROJECTS) {
    const projectId = newId('prj')
    db.prepare('insert into projects (id, studio_id, name, created_at) values (?, ?, ?, ?)').run(projectId, studio.id, name, now())
    enter(projectId)
    await loadSample(set)
    await preloadGuestCanon(set)
    await guestPayoff(set)
    projects.push({ id: projectId, name, set })
  }
  const home = projects[0]!
  enter(home.id)
  audit('guest.created', 'user', id, { projects: projects.map(p => p.name), ms: Date.now() - started })
  db.prepare('update users set last_project_id = ? where id = ?').run(home.id, id)
  await setUserSession(event, { user: { id }, projectId: home.id, loggedInAt: now() })
  return { id, project_id: home.id, projects }
})
