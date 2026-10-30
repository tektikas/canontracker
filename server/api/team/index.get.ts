// Members of the current studio and, for owners and admins, the open invite links.
export default defineEventHandler(() => {
  const { user, studio, role } = access()
  const db = useDb()
  const members = db.prepare(`select u.id, u.name, u.email, m.role, m.created_at joined_at from memberships m join users u on u.id = m.user_id
    where m.studio_id = ? order by m.created_at`).all(studio.id) as { id: string, name: string, email: string, role: Role, joined_at: string }[]
  const canManage = atLeast(role, 'admin')
  const invites = canManage
    ? db.prepare(`select i.id, i.token, i.role, i.created_at, i.expires_at, u.name created_by_name from invites i join users u on u.id = i.created_by
        where i.studio_id = ? and i.accepted_at is null and i.revoked_at is null and i.expires_at > ? order by i.created_at desc`).all(studio.id, now())
    : []
  return { studio, role, user_id: user.id, can_manage: canManage, members, invites }
})
