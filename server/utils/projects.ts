// Project rows with the numbers the settings pages show. One query for the list and the single-project page.
export type ProjectSummary = ProjectRow & { documents: number, canon: number, pending: number, last_activity: string | null, members: number }

export function projectSummaries(studioId: string, projectId?: string) {
  const rows = useDb().prepare(`select p.*,
      (select count(*) from documents d where d.project_id = p.id) documents,
      (select count(*) from facts f where f.project_id = p.id and f.status = 'canon') canon,
      (select count(*) from facts f where f.project_id = p.id and f.status = 'pending') pending,
      (select max(a.created_at) from audit_events a where a.project_id = p.id) last_activity,
      (select count(*) from memberships m where m.studio_id = p.studio_id) members
    from projects p where p.studio_id = ?1 and (?2 is null or p.id = ?2) order by p.created_at`).all(studioId, projectId ?? null) as unknown as ProjectSummary[]
  return rows.map(p => ({ ...p, severity_defaults: projectSeverities(p.severity_defaults) }))
}
