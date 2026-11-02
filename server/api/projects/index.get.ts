// Projects of the current studio, with enough numbers to tell them apart.
export default defineEventHandler(async (event) => {
  const { user, studio, role } = await resolveAccess(event)
  return { studio, role, can_manage: atLeast(role, 'admin'), projects: projectSummaries(studio.id), user_id: user.id }
})
