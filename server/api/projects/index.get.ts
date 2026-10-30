// Projects of the current studio, with enough numbers to tell them apart.
export default defineEventHandler(async (event) => {
  const { user, studio, role } = await resolveAccess(event)
  const projects = useDb().prepare(`select p.*,
      (select count(*) from documents d where d.project_id = p.id) documents,
      (select count(*) from facts f where f.project_id = p.id and f.status = 'canon') canon,
      (select count(*) from facts f where f.project_id = p.id and f.status = 'pending') pending,
      (select max(a.created_at) from audit_events a where a.project_id = p.id) last_activity
    from projects p where p.studio_id = ? order by p.created_at`).all(studio.id) as unknown as (ProjectRow & { documents: number, canon: number, pending: number, last_activity: string | null })[]
  return { studio, role, can_manage: atLeast(role, 'admin'), projects, user_id: user.id }
})
