// One row per document: its latest version, how many versions it has, and the canon citing any of them.
export default defineEventHandler(() =>
  useDb().prepare(`select d.id, d.title, d.filename, d.kind, d.version, d.sha256, d.imported_at, d.origin,
    (select count(*) from passages p where p.document_id = d.id) passages,
    (select count(distinct f.id) from evidence e join facts f on f.id = e.fact_id join documents v on v.id = e.document_id
      where v.project_id = d.project_id and v.filename = d.filename and f.status = 'canon') canon_facts
    from documents d where d.project_id = ?
      and d.version = (select max(version) from documents d2 where d2.project_id = d.project_id and d2.filename = d.filename)
    order by d.rowid`).all(pid()))
