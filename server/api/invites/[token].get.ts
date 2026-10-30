// Public: what the link is for, so the accept page can explain it before anyone signs in.
export default defineEventHandler(async (event) => {
  const invite = findInvite(getRouterParam(event, 'token')!)
  const session = await getUserSession(event)
  return {
    studio_name: invite.studio_name, role: invite.role, created_by_name: invite.created_by_name, expires_at: invite.expires_at, status: invite.status,
    member: !!(session.user && roleIn(invite.studio_id, session.user.id)),
  }
})
