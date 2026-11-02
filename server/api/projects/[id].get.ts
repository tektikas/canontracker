// One project's page data. Account route: it checks studio membership itself and answers 404 for any project outside the user's studios.
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const project = useDb().prepare('select studio_id from projects where id = ?').get(getRouterParam(event, 'id')!) as { studio_id: string } | undefined
  const role = project && roleIn(project.studio_id, user.id)
  if (!project || !role) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Project not found.' })
  const studio = useDb().prepare('select id, name from studios where id = ?').get(project.studio_id) as { id: string, name: string }
  return { studio, role, can_manage: atLeast(role, 'admin'), project: projectSummaries(project.studio_id, getRouterParam(event, 'id'))[0]! }
})
