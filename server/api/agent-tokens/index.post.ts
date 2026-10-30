// Creates a token for the open project with the caller's own role. The secret is in this response only.
export default defineEventHandler(async (event) => {
  const a = await resolveAccess(event)
  event.context.access = a
  const { name } = await readBody<{ name?: string }>(event)
  const clean = cleanName(name, 'token name', 60)
  const { id, secret } = createApiToken(a, clean)
  audit('token.created', 'token', id, { name: clean })
  return { id, name: clean, secret }
})
