export default defineEventHandler(() => {
  const db = useDb()
  // every query below filters on the current project
  const count = (sql: string) => (db.prepare(sql).get(pid()) as { n: number }).n
  const lastScan = () => {
    const r = db.prepare(`select created_at, detail from audit_events where project_id = ? and event_type = 'conflict.scan' order by rowid desc limit 1`).get(pid()) as { created_at: string, detail: string } | undefined
    return r ? { at: r.created_at, facts: (JSON.parse(r.detail) as { facts: number }).facts } : null
  }
  return {
    model: modelInfo(),
    data_model_id: dataModelIds(),
    // Documents, not versions: a new version of a scene is still one scene.
    documents: count('select count(distinct filename) n from documents where project_id = ?'),
    scenes: count(`select count(*) n from documents d where project_id = ? and kind = 'scene'
      and version = (select max(version) from documents d2 where d2.project_id = d.project_id and d2.filename = d.filename)`),
    pending: count(`select count(*) n from facts where project_id = ? and status = 'pending'`),
    canon: count(`select count(*) n from facts where project_id = ? and status = 'canon'`),
    // Facts a person added straight to canon never passed through review; Review's progress leaves them out.
    authored_canon: count(`select count(*) n from facts f where f.project_id = ? and f.status = 'canon' and exists (select 1 from audit_events a
      where a.project_id = f.project_id and a.target_id = f.id and a.event_type = 'fact.authored' and json_extract(a.detail, '$.to') = 'canon')`),
    rejected: count(`select count(*) n from facts where project_id = ? and status = 'rejected'`),
    open_conflicts: count(`select count(*) n from conflicts where project_id = ? and status = 'open'`),
    changes: count('select count(*) n from changes where project_id = ?'),
    open_notes: count(`select count(*) n from notes where project_id = ? and status = 'open'`),
    audit_events: count('select count(*) n from audit_events where project_id = ?'),
    last_scan: lastScan(),
  }
})
