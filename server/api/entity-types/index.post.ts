// A new entity type. Its key comes from the name and never changes; it is placed before "Other" when the project has one.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ one?: unknown, many?: unknown, color?: unknown, icon?: unknown }>(event)
  const one = cleanName(body.one, 'type name', 40)
  const many = body.many === undefined || body.many === '' ? pluralOf(one) : cleanName(body.many, 'plural', 40)
  const color = cleanTypeColor(body.color ?? 'neutral')
  const icon = cleanTypeIcon(body.icon ?? 'other')
  const types = entityTypes()
  if (types.length >= 40) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'Keep it to 40 types.' })
  assertTypeNameFree([one, many])
  const base = one.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'type'
  let key = base
  for (let i = 2; types.some(t => t.key === key); i++) key = `${base}_${i}`
  const d = useDb()
  tx(() => {
    const other = d.prepare(`select position from entity_types where project_id = ? and key = 'other'`).get(pid()) as { position: number } | undefined
    const max = (d.prepare('select max(position) p from entity_types where project_id = ?').get(pid()) as { p: number }).p
    const position = other ? other.position : max + 1
    if (other) d.prepare('update entity_types set position = position + 1 where project_id = ? and position >= ?').run(pid(), position)
    d.prepare('insert into entity_types (project_id, key, one, many, color, icon, position, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(pid(), key, one, many, color, icon, position, now())
    audit('entity_type.created', 'entity_type', key, { key, one, many, color, icon })
  })
  return { key, one, many, color, icon }
})
