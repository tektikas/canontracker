export default defineEventHandler(() => {
  const rows = useDb().prepare(`select c.*, (select name from users where id = c.decided_by) decided_by_name, (select name from users where id = c.reverted_by) reverted_by_name
    from changes c where c.project_id = ? order by c.rowid desc`).all(pid()) as unknown as (ChangeRow & { decided_by_name: string | null, reverted_by_name: string | null })[]
  return rows.map(c => ({ ...c, impact: c.impact ? JSON.parse(c.impact) : [],
    impact_stale: c.impact_stale ? JSON.parse(c.impact_stale) as { audit_id: string, from: string, into: string, at: string } : null }))
})
