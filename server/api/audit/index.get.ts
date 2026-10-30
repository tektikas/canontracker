export default defineEventHandler(() => {
  const rows = useDb().prepare('select * from audit_events order by rowid desc').all() as unknown as AuditRow[]
  return rows.map(r => ({ ...r, detail: JSON.parse(r.detail) as Record<string, unknown> }))
})
