export default defineEventHandler(() => {
  const rows = useDb().prepare(`select a.*, coalesce(u.name, 'Unknown user') actor_name from audit_events a left join users u on u.id = a.actor
    where a.project_id = ? order by a.rowid desc`).all(pid()) as unknown as (AuditRow & { actor_name: string })[]
  return rows.map(r => ({ ...r, detail: JSON.parse(r.detail) as Record<string, unknown> }))
})
