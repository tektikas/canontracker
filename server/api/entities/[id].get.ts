// One wiki page: editorial metadata, the accepted canon that names it (with evidence), and the passages that mention it.
export default defineEventHandler((event) => {
  syncEntities()
  const e = getEntity(getRouterParam(event, 'id')!)
  const d = useDb()
  const facts = factsAbout(e)
  const pending = factsAbout(e, ['pending']).length
  const cited = new Set(facts.flatMap(f => f.evidence.map(ev => ev.passage_id)).filter(Boolean))

  // Appearances are read-time text matches on the latest version of each source; nothing is stored or inferred.
  const names = namesOf(e)
  const re = mentionPattern(names)
  const passages = d.prepare(`select p.id, p.document_id, p.start_line, p.end_line, p.text, doc.title, doc.filename, doc.kind, doc.version
    from passages p join documents doc on doc.id = p.document_id
    where p.project_id = ? and doc.version = (select max(version) from documents d2 where d2.filename = doc.filename and d2.project_id = doc.project_id)
    order by doc.rowid, p.ordinal`).all(pid()) as { id: string, document_id: string, start_line: number, end_line: number, text: string, title: string, filename: string, kind: string, version: number }[]
  const docs = new Map<string, { id: string, title: string, filename: string, kind: string, version: number, passages: { id: string, start_line: number, end_line: number, text: string, cited: boolean }[] }>()
  for (const p of passages) {
    if (!re || !(re.lastIndex = 0, re.test(p.text))) continue
    if (!docs.has(p.document_id)) docs.set(p.document_id, { id: p.document_id, title: p.title, filename: p.filename, kind: p.kind, version: p.version, passages: [] })
    docs.get(p.document_id)!.passages.push({ id: p.id, start_line: p.start_line, end_line: p.end_line, text: p.text, cited: cited.has(p.id) })
  }
  // Notes pinned to text that mentions this entity, matched by name at read time like appearances.
  const notes = re ? listNotes().filter(n => (re.lastIndex = 0, re.test(n.passage_text))) : []
  const who = (id: string | null) => (id ? (d.prepare('select name from users where id = ?').get(id) as { name: string } | undefined)?.name ?? null : null)
  const project = d.prepare('select medium from projects where id = ?').get(pid()) as { medium: string }
  return {
    id: e.id, name: e.name, kind: e.kind, summary: e.summary, aliases: aliasesOf(e), fields: fieldsOf(e), notes: e.notes,
    analysis_name: analysisName(e), merged_from: mergedFrom(e), names,
    portrait: portraitUrl(e), portrait_image: e.portrait_type ? appliedImage('entity', e.id) : null, origin: e.origin, created_at: e.created_at, created_by: who(e.created_by), updated_at: e.updated_at, updated_by: who(e.updated_by),
    medium: mediumOf(project.medium), facts, pending, appearances: [...docs.values()], text_notes: notes,
  }
})
