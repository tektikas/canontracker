// Who is signed in, what they can open and where they are. Public: signed-out visitors get { user: null } and the model status.
export default defineEventHandler(async (event) => {
  const model = modelInfo()
  const session = await getUserSession(event)
  const row = session.user && useDb().prepare('select id, name, email, guest from users where id = ?').get(session.user.id) as { id: string, name: string, email: string, guest: number } | undefined
  if (!row) return { user: null, model, studios: [], projects: [], current: null }
  // guest: a "Try the demo" account (POST /api/auth/guest); the shell shows a banner offering a real sign-up.
  const user = { id: row.id, name: row.name, email: row.email, guest: !!row.guest }

  const studios = useDb().prepare(`select s.id, s.name, m.role from memberships m join studios s on s.id = m.studio_id
    where m.user_id = ? order by s.created_at`).all(user.id) as { id: string, name: string, role: Role }[]
  const projects = projectsFor(user.id)
  let current = projects.find(p => p.id === session.projectId)
  // The project they had open is gone (removed from the studio, or never set): fall back to the first one they can open.
  if (!current && (projects[0] || session.projectId)) {
    current = projects[0]
    await switchProject(event, user.id, current?.id ?? null)
  }
  return {
    user,
    model,
    studios,
    projects: projects.map(p => ({ id: p.id, name: p.name, studio_id: p.studio_id, studio_name: p.studio_name })),
    current: current ? { project: { id: current.id, name: current.name, medium: mediumOf(current.medium) }, studio: { id: current.studio_id, name: current.studio_name }, role: current.role } : null,
  }
})
