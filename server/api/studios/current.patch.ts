export default defineEventHandler(async (event) => {
  const { user, studio } = await resolveAccess(event)
  requireStudioRole(studio.id, user.id, 'admin')
  const name = cleanName((await readObject<{ name?: string }>(event)).name, 'studio name')
  useDb().prepare('update studios set name = ? where id = ?').run(name, studio.id)
  return { id: studio.id, name }
})
