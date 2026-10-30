export default defineEventHandler((event) => {
  const e = getEntity(getRouterParam(event, 'id')!)
  if (!e.portrait_type) return { portrait: null }
  tx(() => {
    useDb().prepare('update entities set portrait_type = null, portrait_at = null, updated_at = ?, updated_by = ? where id = ?').run(now(), access().user.id, e.id)
    audit('entity.portrait_removed', 'entity', e.id, { name: e.name })
  })
  removePortrait(e.id)
  return { portrait: null }
})
