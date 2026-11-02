// Rename, recolour or change the icon of a type. Labels only: pages keep their type (the key never changes).
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')!
  const t = entityTypes().find(x => x.key === key)
  if (!t) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Type not found.' })
  const body = await readBody<{ one?: unknown, many?: unknown, color?: unknown, icon?: unknown }>(event)
  const after = { ...t }
  if (body.one !== undefined) after.one = cleanName(body.one, 'type name', 40)
  if (body.many !== undefined) after.many = body.many === '' ? pluralOf(after.one) : cleanName(body.many, 'plural', 40)
  if (body.color !== undefined) after.color = cleanTypeColor(body.color)
  if (body.icon !== undefined) after.icon = cleanTypeIcon(body.icon)
  const changed = (['one', 'many', 'color', 'icon'] as const).filter(k => after[k] !== t[k])
  if (!changed.length) return after
  assertTypeNameFree([after.one, after.many], key)
  tx(() => {
    useDb().prepare('update entity_types set one = ?, many = ?, color = ?, icon = ? where project_id = ? and key = ?').run(after.one, after.many, after.color, after.icon, pid(), key)
    audit('entity_type.updated', 'entity_type', key, { key, changed, before: Object.fromEntries(changed.map(k => [k, t[k]])), after: Object.fromEntries(changed.map(k => [k, after[k]])) })
  })
  return after
})
