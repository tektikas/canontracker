// Membership rules shared by role change and removal. A studio always keeps at least one owner,
// and only owners can touch an owner or make someone an owner.
export function memberChange(targetId: string, nextRole: Role | null) {
  const { user, studio, role } = access()
  const db = useDb()
  const target = roleIn(studio.id, targetId)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'That person is not in this studio.' })
  const self = targetId === user.id
  if (!self || nextRole) requireRole('admin')
  if ((target === 'owner' || nextRole === 'owner') && role !== 'owner')
    throw createError({ statusCode: 403, statusMessage: 'FORBIDDEN', message: 'Only an owner can change an owner or make someone an owner.' })
  if (target === 'owner' && nextRole !== 'owner') {
    const owners = (db.prepare(`select count(*) n from memberships where studio_id = ? and role = 'owner'`).get(studio.id) as { n: number }).n
    if (owners <= 1)
      throw createError({ statusCode: 409, statusMessage: 'LAST_OWNER', message: 'A studio needs at least one owner. Make someone else an owner first.' })
  }
  if (nextRole) db.prepare('update memberships set role = ? where studio_id = ? and user_id = ?').run(nextRole, studio.id, targetId)
  else db.prepare('delete from memberships where studio_id = ? and user_id = ?').run(studio.id, targetId)
  return { user_id: targetId, role: nextRole }
}

export function parseRole(v: unknown): Role {
  if (!ROLES.includes(v as Role)) throw createError({ statusCode: 400, statusMessage: 'BAD_ROLE', message: `Role must be one of ${ROLES.join(', ')}.` })
  return v as Role
}
