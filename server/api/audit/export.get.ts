export default defineEventHandler((event) => {
  const format = getQuery(event).format === 'md' ? 'md' : 'json'
  const rows = listAudit('asc')
  audit('export.created', 'audit', 'audit_events', { format, events: rows.length })
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '')
  setHeader(event, 'content-disposition', `attachment; filename="canontracker-audit-${stamp}.${format}"`)
  const { project, studio } = access()
  if (format === 'json') return { exported_at: now(), studio: studio.name, project: project.name, model: modelInfo(), events: rows }
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  return [`# CanonTracker audit log`, ``, `${studio.name} · ${project.name} · exported ${now()} · ${modelInfo().label}`, ``,
    `| Time | Event | Target | Actor | Detail |`, `|---|---|---|---|---|`,
    ...rows.map(r => `| ${r.created_at} | ${r.event_type} | ${r.target_type}:${r.target_id}${r.target_removed ? ' (removed by reset)' : ''} | ${r.actor_name} | ${JSON.stringify(r.detail).replaceAll('|', '\\|')} |`)].join('\n')
})
