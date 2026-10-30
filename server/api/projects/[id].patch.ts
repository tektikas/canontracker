export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const project = useDb().prepare('select * from projects where id = ?').get(getRouterParam(event, 'id')!) as unknown as ProjectRow | undefined
  if (!project || !roleIn(project.studio_id, user.id)) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Project not found.' })
  requireStudioRole(project.studio_id, user.id, 'admin')
  const name = cleanName((await readBody<{ name?: string }>(event)).name, 'project name')
  useDb().prepare('update projects set name = ? where id = ?').run(name, project.id)
  return { id: project.id, name }
})
