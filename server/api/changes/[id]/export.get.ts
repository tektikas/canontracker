// Impact manifest for the people who will re-review the documents it lists: JSON, CSV or Markdown. Documents of every kind,
// grouped by kind (the order analyzeImpact gives them), then the related facts.
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const format = String(getQuery(event).format ?? 'json')
  if (!['json', 'csv', 'md'].includes(format)) throw createError({ statusCode: 400, statusMessage: 'BAD_FORMAT', message: 'format must be json, csv or md.' })
  const change = useDb().prepare('select * from changes where id = ? and project_id = ?').get(id, pid()) as unknown as ChangeRow | undefined
  if (!change) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Change not found.' })
  const items = parseImpact(change.impact)
  audit('export.created', 'change', id, { format, items: items.length })
  setHeader(event, 'content-disposition', `attachment; filename="impact-${id}.${format}"`)
  const stale = change.impact_stale ? 'Out of date: a merge changed what this may touch since the analysis ran. Re-run it before relying on this list.' : null
  const scope = { max_hops: 2, canonical_only: true, note: 'Items found within the scope; not a guarantee that nothing else is affected.' }
  const facts = items.filter(i => i.target_type === 'fact')
  const byKind = new Map<string, ImpactItem[]>()
  for (const d of items) if (d.target_type === 'document') byKind.set(d.kind!, [...(byKind.get(d.kind!) ?? []), d])
  // The Library's labels (app/utils/library.ts docKind): a scene is a "Chapter" in a prose project.
  const label = (k: string) => (k === 'scene' && access().project.medium === 'prose' ? 'Chapter' : k.charAt(0).toUpperCase() + k.slice(1))

  if (format === 'csv') {
    setHeader(event, 'content-type', 'text/csv; charset=utf-8')
    const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
    // A stale manifest says so on every row, so a filtered or sorted sheet still carries the warning.
    return [['impact_stale', 'target_type', 'kind', 'label', 'hop_count', 'dependency_type', 'via', 'confidence', 'rationale', 'path', 'evidence_ids'].join(','),
      ...(stale && !items.length ? [[stale].map(esc).join(',')] : []),
      ...items.map(i => [stale ?? '', i.target_type, i.kind ?? '', i.label, i.hop_count, i.dependency_type, i.via, i.confidence, i.rationale, i.path.join(' > '), i.evidence_ids.join(' ')].map(esc).join(','))].join('\n')
  }
  if (format === 'md') {
    setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
    const row = (i: ImpactItem) => `| ${i.label.replaceAll('|', '\\|')} | ${i.hop_count} | ${i.rationale.replaceAll('|', '\\|')} | ${Math.round(i.confidence * 100)}% |`
    const table = (head: string, list: ImpactItem[]) => [`| ${head} | Hops | Why | Confidence |`, '|---|---|---|---|', ...list.map(row), '']
    return [`# Impact manifest ${id}`, '', `**Before:** ${change.before_statement}`, '', `**Proposed:** ${change.proposed_statement}`, '',
      `**Why:** ${change.rationale}`, '', `Status: ${change.status} · scope: accepted canon, max 2 hops. ${scope.note}`, '', ...(stale ? [`**${stale}**`, ''] : []),
      ...(!items.length ? ['No impact found within 2 hops of accepted canon.', ''] : []),
      ...(byKind.size ? ['## Documents to re-review', ''] : []),
      ...[...byKind].flatMap(([k, list]) => [`### ${label(k)} (${list.length})`, '', ...table(label(k), list)]),
      ...(facts.length ? [`## Related facts to re-check (${facts.length})`, '', ...table('Fact', facts)] : [])].join('\n')
  }
  return { change_id: id, status: change.status, before: change.before_statement, proposed: change.proposed_statement, rationale: change.rationale, scope, stale,
    documents_by_kind: Object.fromEntries([...byKind].map(([k, list]) => [k, list.length])), items }
})
