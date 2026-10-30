import { randomBytes } from 'node:crypto'

const DAYS = [1, 7, 30]

// Invites are links: Story Bible does not send email yet, the person who creates the link shares it.
export default defineEventHandler(async (event) => {
  const { user, studio, role: myRole } = requireRole('admin')
  const body = await readBody<{ role?: string, days?: number }>(event)
  const role = parseRole(body.role)
  if (role === 'owner' && myRole !== 'owner')
    throw createError({ statusCode: 403, statusMessage: 'FORBIDDEN', message: 'Only an owner can invite another owner.' })
  const days = DAYS.includes(Number(body.days)) ? Number(body.days) : 7
  const invite = { id: newId('inv'), token: randomBytes(18).toString('base64url'), role, created_at: now(), expires_at: new Date(Date.now() + days * 864e5).toISOString() }
  useDb().prepare('insert into invites (id, studio_id, token, role, created_by, created_at, expires_at) values (?, ?, ?, ?, ?, ?, ?)')
    .run(invite.id, studio.id, invite.token, role, user.id, invite.created_at, invite.expires_at)
  return { ...invite, created_by_name: user.name }
})
