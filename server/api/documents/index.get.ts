export default defineEventHandler(() =>
  useDb().prepare(`select d.id, d.title, d.filename, d.kind, d.version, d.sha256, d.imported_at,
    (select count(*) from passages p where p.document_id = d.id) passages,
    (select count(*) from evidence e join facts f on f.id = e.fact_id where e.document_id = d.id and f.status = 'canon') canon_facts
    from documents d order by d.rowid`).all())
