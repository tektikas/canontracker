// Creates a project in a studio the caller administers and opens it. medium: prose | screen | game (the app always asks; an API
// caller that sends none gets prose). A sample loaded into it afterwards sets the sample's own medium.
export default defineEventHandler(async (event) => {
  const { user, session } = await requireUser(event)
  const body = await readObject<{ name?: string, studio_id?: string, medium?: unknown }>(event)
  const name = cleanName(body.name, 'project name')
  if (body.medium !== undefined && !Object.hasOwn(MEDIA, String(body.medium))) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: `Medium must be one of ${Object.keys(MEDIA).join(', ')}.` })
  const medium = (body.medium as string | undefined) ?? 'prose'
  const studioId = idOf(body.studio_id)
    || (useDb().prepare('select studio_id from projects where id = ?').get(String(session.projectId ?? '')) as { studio_id: string } | undefined)?.studio_id
  if (!studioId) throw createError({ statusCode: 400, statusMessage: 'NO_STUDIO', message: 'Choose a studio for the project.' })
  requireStudioRole(studioId, user.id, 'admin')
  const id = newId('prj')
  useDb().prepare('insert into projects (id, studio_id, name, created_at, medium) values (?, ?, ?, ?, ?)').run(id, studioId, name, now(), medium)
  await switchProject(event, user.id, id)
  return { id, name, studio_id: studioId, medium }
})
