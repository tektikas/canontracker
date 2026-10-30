// Joins the studio with the invite's role and opens its first project. A link works once.
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const invite = findInvite(getRouterParam(event, 'token')!)
  const db = useDb()
  if (!roleIn(invite.studio_id, user.id)) {
    if (invite.status !== 'valid')
      throw createError({ statusCode: 410, statusMessage: 'INVITE_' + invite.status.toUpperCase(), message: `This invite link was ${invite.status === 'used' ? 'already used' : invite.status}. Ask ${invite.created_by_name} for a new one.` })
    tx(() => {
      db.prepare('insert into memberships values (?, ?, ?, ?)').run(invite.studio_id, user.id, invite.role, now())
      db.prepare('update invites set accepted_by = ?, accepted_at = ? where id = ?').run(user.id, now(), invite.id)
    })
  }
  const project = db.prepare('select id from projects where studio_id = ? order by created_at limit 1').get(invite.studio_id) as { id: string } | undefined
  await switchProject(event, user.id, project?.id ?? null)
  return { studio_id: invite.studio_id, project_id: project?.id ?? null }
})
