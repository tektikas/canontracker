// Creates a token for the open project with the caller's own role. The secret is in this response only. level: propose
// (default) or full ("acts as you", canon decisions included); it can't be changed later. An agent never mints tokens.
export default defineEventHandler(async (event) => {
  if (event.context.mcpAccess) throw createError({ statusCode: 403, statusMessage: 'FORBIDDEN', message: 'API tokens are created by a person in Settings, never by an agent.' })
  const a = await resolveAccess(event)
  event.context.access = a
  const { name, level } = await readObject<{ name?: string, level?: string }>(event)
  const clean = cleanName(name, 'token name', 60)
  if (level !== undefined && !TOKEN_LEVELS.includes(level as TokenLevel)) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'level must be propose or full.' })
  const lvl = (level ?? 'propose') as TokenLevel
  const { id, secret } = createApiToken(a, clean, lvl)
  audit('token.created', 'token', id, { name: clean, level: lvl })
  return { id, name: clean, level: lvl, secret }
})
