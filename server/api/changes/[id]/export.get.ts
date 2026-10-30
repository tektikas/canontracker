// Impact manifest for the people who will re-review scenes: JSON, CSV or Markdown.
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const format = String(getQuery(event).format ?? 'json')
  const change = useDb().prepare('select * from changes where id = ?').get(id) as unknown as ChangeRow | undefined
  if (!change) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Change not found.' })
  const items = JSON.parse(change.impact ?? '[]') as ImpactItem[]
  audit('export.created', 'change', id, { format, items: items.length })
  setHeader(event, 'content-disposition', `attachment; filename="impact-${id}.${format === 'md' ? 'md' : format}"`)
  const scope = { max_hops: 2, canonical_only: true, note: 'Items found within the scope; not a guarantee that nothing else is affected.' }

  if (format === 'csv') {
    setHeader(event, 'content-type', 'text/csv; charset=utf-8')
    const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
    return [['target_type', 'label', 'hop_count', 'dependency_type', 'via', 'confidence', 'rationale', 'path', 'evidence_ids'].join(','),
      ...items.map(i => [i.target_type, i.label, i.hop_count, i.dependency_type, i.via, i.confidence, i.rationale, i.path.join(' > '), i.evidence_ids.join(' ')].map(esc).join(','))].join('\n')
  }
  if (format === 'md') {
    setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
    return [`# Impact manifest ${id}`, '', `**Before:** ${change.before_statement}`, '', `**Proposed:** ${change.proposed_statement}`, '',
      `**Why:** ${change.rationale}`, '', `Status: ${change.status} · scope: accepted canon, max 2 hops. ${scope.note}`, '',
      '| Type | Item | Hops | Why | Confidence |', '|---|---|---|---|---|',
      ...items.map(i => `| ${i.target_type} | ${i.label.replaceAll('|', '\\|')} | ${i.hop_count} | ${i.rationale.replaceAll('|', '\\|')} | ${Math.round(i.confidence * 100)}% |`)].join('\n')
  }
  return { change_id: id, status: change.status, before: change.before_statement, proposed: change.proposed_statement, rationale: change.rationale, scope, items }
})
