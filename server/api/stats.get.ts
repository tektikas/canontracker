export default defineEventHandler(() => {
  const db = useDb()
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n
  return {
    model: modelInfo(),
    documents: count('select count(*) n from documents'),
    scenes: count(`select count(*) n from documents where kind = 'scene'`),
    pending: count(`select count(*) n from facts where status = 'pending'`),
    canon: count(`select count(*) n from facts where status = 'canon'`),
    rejected: count(`select count(*) n from facts where status = 'rejected'`),
    open_conflicts: count(`select count(*) n from conflicts where status = 'open'`),
    changes: count('select count(*) n from changes'),
    audit_events: count('select count(*) n from audit_events'),
  }
})
