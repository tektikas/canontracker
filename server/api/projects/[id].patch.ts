export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const project = useDb().prepare('select * from projects where id = ?').get(getRouterParam(event, 'id')!) as unknown as ProjectRow | undefined
  if (!project || !roleIn(project.studio_id, user.id)) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Project not found.' })
  requireStudioRole(project.studio_id, user.id, 'admin')
  const body = await readBody<{ name?: string, medium?: string, art_style?: unknown }>(event)
  const name = body.name === undefined ? project.name : cleanName(body.name, 'project name')
  if (body.medium !== undefined && !(body.medium in MEDIA)) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: `Medium must be one of ${Object.keys(MEDIA).join(', ')}.` })
  const medium = mediumOf(body.medium ?? project.medium)
  const artStyle = body.art_style === undefined ? project.art_style : cleanText(body.art_style, 'Art style', 500)
  useDb().prepare('update projects set name = ?, medium = ?, art_style = ? where id = ?').run(name, medium, artStyle, project.id)
  return { id: project.id, name, medium, art_style: artStyle }
})
