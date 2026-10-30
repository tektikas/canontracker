export default defineEventHandler((event) => {
  const { studio } = requireRole('admin')
  const r = useDb().prepare('update invites set revoked_at = ? where id = ? and studio_id = ? and accepted_at is null and revoked_at is null')
    .run(now(), getRouterParam(event, 'id')!, studio.id)
  if (!r.changes) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Invite not found or already used.' })
  return { ok: true }
})
