// Revokes one of your own tokens; it stops working at once and stays listed as revoked.
export default defineEventHandler(async (event) => {
  const a = await resolveAccess(event)
  event.context.access = a
  const id = getRouterParam(event, 'id')!
  const r = useDb().prepare('update api_tokens set revoked_at = ? where id = ? and user_id = ? and project_id = ? and revoked_at is null')
    .run(now(), id, a.user.id, a.project.id)
  if (!r.changes) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Token not found.' })
  audit('token.revoked', 'token', id)
  return { id, revoked: true }
})
