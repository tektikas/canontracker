interface LibraryDocument {
  id: string, title: string, filename: string, name: string, kind: string, version: number, sha256: string, imported_at: string, origin: string
  folder_id: string | null, created_by_name: string | null, passages: number, canon_facts: number, stale_facts: number, pending_facts: number
}

// One row per document: its latest version, its labels, how many versions it has, who saved the latest, the canon citing
// any version, and how many of those facts cite an older version than the latest (stale: re-check them).
export default defineEventHandler(() => {
  const db = useDb()
  const rows = db.prepare(`select d.id, d.title, d.filename, d.name, d.kind, d.version, d.sha256, d.imported_at, d.origin, d.folder_id,
    (select name from users u where u.id = d.created_by) created_by_name,
    (select count(*) from passages p where p.document_id = d.id) passages,
    (select count(distinct f.id) from evidence e join facts f on f.id = e.fact_id join documents v on v.id = e.document_id
      where v.project_id = d.project_id and v.filename = d.filename and f.status = 'canon') canon_facts,
    (select count(distinct f.id) from evidence e join facts f on f.id = e.fact_id join documents v on v.id = e.document_id
      where v.project_id = d.project_id and v.filename = d.filename and f.status = 'canon' and v.version < d.version) stale_facts,
    (select count(distinct f.id) from evidence e join facts f on f.id = e.fact_id join documents v on v.id = e.document_id
      where v.project_id = d.project_id and v.filename = d.filename and f.status = 'pending') pending_facts
    from documents d where d.project_id = ?
      and d.version = (select max(version) from documents d2 where d2.project_id = d.project_id and d2.filename = d.filename)
    order by d.rowid`).all(pid()) as unknown as LibraryDocument[]
  const tags = new Map<string, string[]>()
  for (const t of db.prepare('select filename, tag_id from document_tags where project_id = ?').all(pid()) as { filename: string, tag_id: string }[])
    tags.set(t.filename, [...(tags.get(t.filename) ?? []), t.tag_id])
  return rows.map(r => ({ ...r, tags: tags.get(r.filename) ?? [] }))
})
