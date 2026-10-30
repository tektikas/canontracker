// Creates a studio with the caller as its owner (onboarding step 1).
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const name = cleanName((await readBody<{ name?: string }>(event)).name, 'studio name')
  const id = newId('std')
  tx(() => {
    useDb().prepare('insert into studios values (?, ?, ?, ?)').run(id, name, user.id, now())
    useDb().prepare(`insert into memberships values (?, ?, 'owner', ?)`).run(id, user.id, now())
  })
  return { id, name }
})
