interface InviteRow { id: string, studio_id: string, role: Role, created_by: string, expires_at: string, accepted_at: string | null, revoked_at: string | null }

export function findInvite(token: string) {
  const invite = useDb().prepare(`select i.*, s.name studio_name, u.name created_by_name from invites i join studios s on s.id = i.studio_id
    join users u on u.id = i.created_by where i.token = ?`).get(token) as unknown as (InviteRow & { studio_name: string, created_by_name: string }) | undefined
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'This invite link is not valid. Ask for a new one.' })
  const status = invite.revoked_at ? 'revoked' : invite.accepted_at ? 'used' : invite.expires_at <= now() ? 'expired' : 'valid'
  return { ...invite, status }
}
