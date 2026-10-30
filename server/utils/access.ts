import type { H3Event } from 'h3'

export const ROLES = ['viewer', 'editor', 'admin', 'owner'] as const
export type Role = typeof ROLES[number]
export const atLeast = (role: Role, min: Role) => ROLES.indexOf(role) >= ROLES.indexOf(min)

export interface UserRow { id: string, email: string, name: string, password_hash: string, last_project_id: string | null, created_at: string }
export interface ProjectRow { id: string, studio_id: string, name: string, created_at: string }
export interface Access {
  user: { id: string, name: string, email: string }
  project: ProjectRow
  studio: { id: string, name: string }
  role: Role
}

const fail = (statusCode: number, statusMessage: string, message: string) => createError({ statusCode, statusMessage, message })

// The signed-in user, re-read from the database so a deleted account or stale cookie never passes.
export async function requireUser(event: H3Event) {
  const session = await getUserSession(event)
  const user = session.user && useDb().prepare('select * from users where id = ?').get(session.user.id) as unknown as UserRow | undefined
  if (!user) throw fail(401, 'UNAUTHENTICATED', 'Log in to continue.')
  return { user, session }
}

export function roleIn(studioId: string, userId: string) {
  const m = useDb().prepare('select role from memberships where studio_id = ? and user_id = ?').get(studioId, userId) as { role: Role } | undefined
  return m?.role
}

export function requireStudioRole(studioId: string, userId: string, min: Role) {
  const role = roleIn(studioId, userId)
  if (!role) throw fail(404, 'NOT_FOUND', 'Studio not found.')
  if (!atLeast(role, min)) throw fail(403, 'FORBIDDEN', `Only a studio ${min === 'owner' ? 'owner' : `${min} or above`} can do this.`)
  return role
}

// Projects the user can open, across every studio they belong to.
export function projectsFor(userId: string) {
  return useDb().prepare(`select p.*, s.name studio_name, m.role from projects p join studios s on s.id = p.studio_id
    join memberships m on m.studio_id = p.studio_id and m.user_id = ? order by s.created_at, p.created_at`).all(userId) as unknown as (ProjectRow & { studio_name: string, role: Role })[]
}

// The current project comes from the session and is checked against memberships on every request.
export async function resolveAccess(event: H3Event): Promise<Access> {
  const { user, session } = await requireUser(event)
  const projectId = (session as { projectId?: string }).projectId
  const project = projectId ? useDb().prepare('select * from projects where id = ?').get(projectId) as unknown as ProjectRow | undefined : undefined
  const role = project && roleIn(project.studio_id, user.id)
  if (!project || !role) throw fail(409, 'NO_PROJECT', 'Open a project first.')
  const studio = useDb().prepare('select id, name from studios where id = ?').get(project.studio_id) as { id: string, name: string }
  return { user: { id: user.id, name: user.name, email: user.email }, project, studio, role }
}

// Set by server/middleware/access.ts for every content route.
export function access(): Access {
  const a = useEvent().context.access as Access | undefined
  if (!a) throw fail(500, 'NO_ACCESS_CONTEXT', 'Route is not behind the project guard.')
  return a
}
export const pid = () => access().project.id

export function requireRole(min: Role) {
  const a = access()
  if (!atLeast(a.role, min)) throw fail(403, 'FORBIDDEN', `Your role (${a.role}) can't do this. Ask a studio owner or admin.`)
  return a
}

export async function switchProject(event: H3Event, userId: string, projectId: string | null) {
  useDb().prepare('update users set last_project_id = ? where id = ?').run(projectId, userId)
  const session = await getUserSession(event)
  await replaceUserSession(event, { ...session, projectId })
}

const bad = (message: string, statusMessage = 'INVALID') => fail(400, statusMessage, message)
export function cleanName(v: unknown, what: string, max = 80) {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''
  if (!s) throw bad(`Enter a ${what}.`)
  if (s.length > max) throw bad(`Keep the ${what} under ${max} characters.`)
  return s
}
export function cleanEmail(v: unknown) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad('Enter a valid email address.')
  return s
}
export const MIN_PASSWORD = 8
