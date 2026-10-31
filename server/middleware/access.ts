// The one project guard. Every /api route that is not about accounts runs inside the caller's current project:
// signed in, a member of that project's studio, and viewers may only read and ask.
const ACCOUNT = ['/api/auth/', '/api/_auth/', '/api/invites', '/api/studios', '/api/projects', '/api/onboarding', '/api/agent-tokens']

// /api/public/ is read by people outside the studio (share links); those handlers resolve their own token-bound project.
const PUBLIC = '/api/public/'

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]!
  if (!path.startsWith('/api/') || path === '/api/me' || path === '/api/health' || path.startsWith(PUBLIC) || ACCOUNT.some(p => path.startsWith(p))) return
  const a = await resolveAccess(event)
  event.context.access = a
  // Anyone may leave a studio; memberChange still requires admin to touch anyone else.
  const leaving = event.method === 'DELETE' && /^\/api\/team\/[^/]+$/.test(path)
  if (a.role === 'viewer' && event.method !== 'GET' && path !== '/api/qa' && !leaving)
    throw createError({ statusCode: 403, statusMessage: 'FORBIDDEN', message: 'Viewers can read and ask questions. Ask a studio owner or admin for editor access.' })
})
