export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const project = useDb().prepare('select * from projects where id = ?').get(getRouterParam(event, 'id')!) as unknown as ProjectRow | undefined
  if (!project || !roleIn(project.studio_id, user.id)) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Project not found.' })
  requireStudioRole(project.studio_id, user.id, 'admin')
  const body = await readBody<{ name?: string, medium?: string }>(event)
  const name = body.name === undefined ? project.name : cleanName(body.name, 'project name')
  if (body.medium !== undefined && !Object.hasOwn(MEDIA, body.medium)) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: `Medium must be one of ${Object.keys(MEDIA).join(', ')}.` })
  const medium = mediumOf(body.medium ?? project.medium)
  useDb().prepare('update projects set name = ?, medium = ? where id = ?').run(name, medium, project.id)
  return { id: project.id, name, medium }
})
