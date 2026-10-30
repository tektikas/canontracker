// Your own tokens for the project you have open. Secrets are never stored, so only the prefix is shown.
export default defineEventHandler(async (event) => {
  const { user, project, role } = await resolveAccess(event)
  const tokens = useDb().prepare(`select id, name, prefix, created_at, last_used_at, revoked_at from api_tokens
    where user_id = ? and project_id = ? order by created_at desc`).all(user.id, project.id) as unknown as Pick<TokenRow, 'id' | 'name' | 'prefix' | 'created_at' | 'last_used_at' | 'revoked_at'>[]
  return { project: { id: project.id, name: project.name }, role, tokens }
})
