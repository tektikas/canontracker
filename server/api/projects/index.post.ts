// Creates a project (a game) in a studio the caller administers and opens it.
export default defineEventHandler(async (event) => {
  const { user, session } = await requireUser(event)
  const body = await readObject<{ name?: string, studio_id?: string }>(event)
  const name = cleanName(body.name, 'project name')
  const studioId = idOf(body.studio_id)
    || (useDb().prepare('select studio_id from projects where id = ?').get(String(session.projectId ?? '')) as { studio_id: string } | undefined)?.studio_id
  if (!studioId) throw createError({ statusCode: 400, statusMessage: 'NO_STUDIO', message: 'Choose a studio for the project.' })
  requireStudioRole(studioId, user.id, 'admin')
  const id = newId('prj')
  useDb().prepare('insert into projects (id, studio_id, name, created_at) values (?, ?, ?, ?)').run(id, studioId, name, now())
  await switchProject(event, user.id, id)
  return { id, name, studio_id: studioId }
})
