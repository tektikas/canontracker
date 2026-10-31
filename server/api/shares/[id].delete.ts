// Turns a share link off for good. It stays listed as revoked; opening it answers 404.
export default defineEventHandler((event) => {
  const { user } = requireRole('editor')
  const id = getRouterParam(event, 'id')!
  const row = useDb().prepare('select name from share_links where id = ? and project_id = ? and revoked_at is null').get(id, pid()) as { name: string } | undefined
  if (!row) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Share link not found.' })
  tx(() => {
    useDb().prepare('update share_links set revoked_at = ?, revoked_by = ? where id = ?').run(now(), user.id, id)
    audit('share.revoked', 'share', id, { name: row.name })
  })
  return { id, revoked: true }
})
