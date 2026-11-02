// The project's entity types (shared/utils/entities.ts explains the model). Editorial metadata: conflicts and impact never read them.

const fail = (statusCode: number, statusMessage: string, message: string) => createError({ statusCode, statusMessage, message })

// Upgrade and new projects in one place, idempotent: a project with no types yet (made before types were per project, or just
// created) gets its medium's defaults plus every kind its pages already use, so no existing page changes type. `insert or
// ignore` on (project_id, key) keeps a concurrent first read harmless. A project always keeps at least one type (the API
// refuses to remove the last), so this never runs twice for the same project.
export function seedEntityTypes(projectId: string) {
  const d = useDb()
  const p = d.prepare('select medium from projects where id = ?').get(projectId) as { medium: string } | undefined
  const inUse = (d.prepare('select distinct kind from entities where project_id = ? order by kind').all(projectId) as { kind: string }[]).map(r => r.kind)
  const keys = [...new Set([...MEDIA[mediumOf(p?.medium)].types, ...inUse])]
  const insert = d.prepare('insert or ignore into entity_types (project_id, key, one, many, color, icon, position, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
  keys.forEach((k, i) => {
    const t = typeOf([], k)
    insert.run(projectId, k, t.one, t.many, t.color, t.icon, i, now())
  })
}

// Projects are made as games and the medium is set after, so a medium change before the project has any page swaps the
// untouched defaults for the new medium's. Types the team added or edited stay; once pages exist, types never change here.
export function retypeForMedium(projectId: string) {
  const d = useDb()
  if (d.prepare('select 1 from entities where project_id = ? limit 1').get(projectId)) return
  const rows = d.prepare('select key, one, many, color, icon from entity_types where project_id = ?').all(projectId) as unknown as EntityType[]
  const untouched = rows.filter(r => (['one', 'many', 'color', 'icon'] as const).every(k => DEFAULT_TYPES[r.key]?.[k] === r[k]))
  const del = d.prepare('delete from entity_types where project_id = ? and key = ?')
  for (const r of untouched) del.run(projectId, r.key)
  seedEntityTypes(projectId)
}

export function entityTypes(): EntityType[] {
  const read = () => useDb().prepare('select key, one, many, color, icon from entity_types where project_id = ? order by position, rowid').all(pid()) as unknown as EntityType[]
  const rows = read()
  if (rows.length) return rows
  seedEntityTypes(pid())
  return read()
}

export const kindOf = (key: string) => typeOf(entityTypes(), key)

export function cleanKind(v: unknown) {
  const types = entityTypes()
  if (typeof v !== 'string' || !types.some(t => t.key === v)) throw fail(400, 'INVALID', `Type must be one of ${types.map(t => t.one).join(', ')}.`)
  return v
}

export function cleanTypeColor(v: unknown): TypeColor {
  if (!Object.hasOwn(TYPE_COLORS, v as string)) throw fail(400, 'INVALID', `Colour must be one of ${Object.keys(TYPE_COLORS).join(', ')}.`)
  return v as TypeColor
}

export function cleanTypeIcon(v: unknown): TypeIcon {
  if (!TYPE_ICONS.includes(v as TypeIcon)) throw fail(400, 'INVALID', `Icon must be one of ${TYPE_ICONS.join(', ')}.`)
  return v as TypeIcon
}

// One type per name in a project, case-insensitively, singular or plural.
export function assertTypeNameFree(names: string[], exceptKey?: string) {
  for (const t of entityTypes()) {
    if (t.key === exceptKey) continue
    const clash = names.find(n => [t.one, t.many].some(x => normName(x) === normName(n)))
    if (clash) throw fail(409, 'NAME_TAKEN', `There is already a type called ${t.one}.`)
  }
}
