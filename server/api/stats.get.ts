export default defineEventHandler(() => {
  const db = useDb()
  // every query below filters on the current project
  const count = (sql: string) => (db.prepare(sql).get(pid()) as { n: number }).n
  return {
    model: modelInfo(),
    data_model_id: dataModelIds(),
    documents: count('select count(*) n from documents where project_id = ?'),
    scenes: count(`select count(*) n from documents where project_id = ? and kind = 'scene'`),
    pending: count(`select count(*) n from facts where project_id = ? and status = 'pending'`),
    canon: count(`select count(*) n from facts where project_id = ? and status = 'canon'`),
    rejected: count(`select count(*) n from facts where project_id = ? and status = 'rejected'`),
    open_conflicts: count(`select count(*) n from conflicts where project_id = ? and status = 'open'`),
    changes: count('select count(*) n from changes where project_id = ?'),
    audit_events: count('select count(*) n from audit_events where project_id = ?'),
  }
})
