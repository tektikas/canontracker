// Removes a type. Pages that use it must go somewhere: ?move_to=<key> names the type they take on (required when any do).
// The audit event lists every page moved, so the decision can be traced and undone by hand. A project keeps at least one type.
// Everything is read under the write lock (tx), so a page created or retyped by another process can't slip past the
// check or be moved without being listed.
export default defineEventHandler((event) => {
  const key = getRouterParam(event, 'key')!
  const moveTo = getQuery(event).move_to
  const d = useDb()
  return tx(() => {
    const types = entityTypes()
    const t = types.find(x => x.key === key)
    if (!t) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Type not found.' })
    if (types.length === 1) throw createError({ statusCode: 400, statusMessage: 'LAST_TYPE', message: 'A project needs at least one entity type.' })
    const pages = (d.prepare('select id, name from entities where project_id = ? and kind = ? order by name collate nocase').all(pid(), key) as { id: string, name: string }[])
    const into = pages.length ? types.find(x => x.key === moveTo && x.key !== key) : undefined
    if (pages.length && !into) {
      throw createError({ statusCode: 409, statusMessage: 'IN_USE', message: `${pages.length} ${pages.length === 1 ? 'page is' : 'pages are'} ${t.many}. Choose the type they become.`, data: { pages: pages.length } })
    }
    if (into) d.prepare('update entities set kind = ?, updated_at = ?, updated_by = ? where project_id = ? and kind = ?').run(into.key, now(), access().user.id, pid(), key)
    d.prepare('delete from entity_types where project_id = ? and key = ?').run(pid(), key)
    audit('entity_type.deleted', 'entity_type', key, { key, one: t.one, many: t.many, color: t.color, icon: t.icon, moved_to: into?.key ?? null, moved_to_name: into?.one ?? null, entities: pages })
    return { ok: true, moved: pages.length, moved_to: into?.key ?? null }
  })
})
