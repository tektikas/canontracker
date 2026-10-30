export default defineEventHandler((event) => {
  const format = getQuery(event).format === 'md' ? 'md' : 'json'
  const rows = (useDb().prepare(`select a.*, coalesce(u.name, 'Unknown user') actor_name from audit_events a left join users u on u.id = a.actor
    where a.project_id = ? order by a.rowid`).all(pid()) as unknown as (AuditRow & { actor_name: string })[])
    .map(r => ({ ...r, detail: JSON.parse(r.detail) }))
  audit('export.created', 'audit', 'audit_events', { format, events: rows.length })
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '')
  setHeader(event, 'content-disposition', `attachment; filename="storybible-audit-${stamp}.${format}"`)
  const { project, studio } = access()
  if (format === 'json') return { exported_at: now(), studio: studio.name, project: project.name, model: modelInfo(), events: rows }
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  return [`# Story Bible audit log`, ``, `${studio.name} · ${project.name} · exported ${now()} · ${modelInfo().label}`, ``,
    `| Time | Event | Target | Actor | Detail |`, `|---|---|---|---|---|`,
    ...rows.map(r => `| ${r.created_at} | ${r.event_type} | ${r.target_type}:${r.target_id} | ${r.actor_name} | ${JSON.stringify(r.detail).replaceAll('|', '\\|')} |`)].join('\n')
})
