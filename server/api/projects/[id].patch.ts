export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const project = useDb().prepare('select * from projects where id = ?').get(getRouterParam(event, 'id')!) as unknown as ProjectRow | undefined
  if (!project || !roleIn(project.studio_id, user.id)) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Project not found.' })
  requireStudioRole(project.studio_id, user.id, 'admin')
  const body = await readObject<{ name?: string, medium?: string, art_style?: unknown, severity_defaults?: Record<string, unknown> }>(event)
  const name = body.name === undefined ? project.name : cleanName(body.name, 'project name')
  if (body.medium !== undefined && !Object.hasOwn(MEDIA, String(body.medium))) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: `Medium must be one of ${Object.keys(MEDIA).join(', ')}.` })
  const medium = mediumOf(body.medium ?? project.medium)
  const artStyle = body.art_style === undefined ? project.art_style : cleanText(body.art_style, 'Art style', 500)
  let severities = project.severity_defaults
  if (body.severity_defaults !== undefined) {
    if (!body.severity_defaults || typeof body.severity_defaults !== 'object' || Array.isArray(body.severity_defaults))
      throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'severity_defaults must be an object of rule: hard | soft.' })
    const next = JSON.parse(severities || '{}') as Record<string, Severity> // overrides only: absent = no override
    for (const [rule, v] of Object.entries(body.severity_defaults)) {
      if (!Object.hasOwn(RULE_SEVERITY, rule) || !SEVERITIES.includes(v as Severity)) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'Severity must be hard or soft, for a known rule.' })
      next[rule] = v as Severity
    }
    severities = JSON.stringify(next)
  }
  tx(() => {
    useDb().prepare('update projects set name = ?, medium = ?, art_style = ?, severity_defaults = ? where id = ?').run(name, medium, artStyle, severities, project.id)
    if (medium !== project.medium) retypeForMedium(project.id)
  })
  return { id: project.id, name, medium, art_style: artStyle, severity_defaults: projectSeverities(severities) }
})
