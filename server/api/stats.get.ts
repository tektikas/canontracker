export default defineEventHandler(() => {
  const db = useDb()
  const a = access()
  // every query below filters on the current project
  const count = (sql: string) => (db.prepare(sql).get(pid()) as { n: number }).n
  const lastScan = () => {
    // Only scans since the last reset count: the audit keeps older ones, but the canon they checked is gone.
    const r = db.prepare(`select created_at, detail from audit_events where project_id = ?1 and event_type = 'conflict.scan'
      and rowid > coalesce((select max(rowid) from audit_events where project_id = ?1 and event_type = 'project.reset'), 0) order by rowid desc limit 1`).get(pid()) as { created_at: string, detail: string } | undefined
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
    // Facts a person added straight to canon, and a sample's preloaded canon, never passed through review; Review's progress leaves them out.
    authored_canon: count(`select count(*) n from facts f where f.project_id = ? and f.status = 'canon' and (f.origin = 'sample' or exists (select 1 from audit_events a
      where a.project_id = f.project_id and a.target_id = f.id and a.event_type = 'fact.authored' and json_extract(a.detail, '$.to') = 'canon'))`),
    sample_canon: count(`select count(*) n from facts where project_id = ? and status = 'canon' and origin = 'sample'`),
    rejected: count(`select count(*) n from facts where project_id = ? and status = 'rejected'`),
    open_conflicts: count(`select count(*) n from conflicts where project_id = ? and status = 'open'`),
    open_hard: count(`select count(*) n from conflicts where project_id = ? and status = 'open' and severity = 'hard'`),
    open_soft: count(`select count(*) n from conflicts where project_id = ? and status = 'open' and severity = 'soft'`),
    changes: count('select count(*) n from changes where project_id = ?'),
    open_notes: count(`select count(*) n from notes where project_id = ? and status = 'open'`),
    audit_events: count('select count(*) n from audit_events where project_id = ?'),
    last_scan: lastScan(),
    // Getting started on Home: has anyone else been invited to the studio, and has this person connected an agent here.
    teammates: (db.prepare(`select (select count(*) from memberships where studio_id = ? and user_id != ?)
      + (select count(*) from invites where studio_id = ? and revoked_at is null and accepted_at is null and expires_at > ?) n`)
      .get(a.studio.id, a.user.id, a.studio.id, now()) as { n: number }).n,
    agent_tokens: (db.prepare('select count(*) n from api_tokens where user_id = ? and project_id = ? and revoked_at is null').get(a.user.id, pid()) as { n: number }).n,
  }
})
