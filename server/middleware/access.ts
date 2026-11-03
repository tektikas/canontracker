// The one project guard. Every /api route that is not about accounts runs inside the caller's current project:
// signed in, a member of that project's studio, and viewers may only read and ask (in Ask's conversations too).
const ACCOUNT = ['/api/auth/', '/api/_auth/', '/api/invites', '/api/studios', '/api/account', '/api/projects', '/api/onboarding', '/api/agent-tokens']

// /api/public/ is read by people outside the studio (share links); those handlers resolve their own token-bound project.
const PUBLIC = '/api/public/'

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]!
  if (!path.startsWith('/api/') || path === '/api/me' || path === '/api/health' || path.startsWith(PUBLIC) || ACCOUNT.some(p => path.startsWith(p))) return
  // resolveAccess: the session's project, or the token's Access when an MCP tool calls this route in-process
  // (event.context.mcpAccess is only ever set by such an in-process call, never by an HTTP request).
  const a = await resolveAccess(event)
  event.context.access = a
  // Anyone may leave a studio; memberChange still requires admin to touch anyone else.
  const leaving = event.method === 'DELETE' && /^\/api\/team\/[^/]+$/.test(path)
  // Viewers ask: /api/qa, and posting in Ask's conversations (starting one, or a message in one). Renaming stays editor+.
  // Voice input only turns speech into text for the person to review (nothing is stored), so viewers can ask by voice too.
  const asking = path === '/api/qa' || path === '/api/voice/transcribe' || (event.method === 'POST' && /^\/api\/conversations(\/[^/]+\/messages)?$/.test(path))
  if (a.role === 'viewer' && event.method !== 'GET' && !asking && !leaving)
    throw createError({ statusCode: 403, statusMessage: 'FORBIDDEN', message: 'Viewers can read and ask questions. Ask a studio owner or admin for editor access.' })
})
