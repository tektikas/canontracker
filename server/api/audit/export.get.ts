export default defineEventHandler((event) => {
  const format = getQuery(event).format === 'md' ? 'md' : 'json'
  const rows = (useDb().prepare('select * from audit_events order by rowid').all() as unknown as AuditRow[])
    .map(r => ({ ...r, detail: JSON.parse(r.detail) }))
  audit('export.created', 'audit', 'audit_events', { format, events: rows.length })
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '')
  setHeader(event, 'content-disposition', `attachment; filename="storybible-audit-${stamp}.${format}"`)
  if (format === 'json') return { exported_at: now(), model: modelInfo(), events: rows }
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  return [`# Story Bible audit log`, ``, `Exported ${now()} · ${modelInfo().label}`, ``,
    `| Time | Event | Target | Actor | Detail |`, `|---|---|---|---|---|`,
    ...rows.map(r => `| ${r.created_at} | ${r.event_type} | ${r.target_type}:${r.target_id} | ${r.actor} | ${JSON.stringify(r.detail).replaceAll('|', '\\|')} |`)].join('\n')
})
