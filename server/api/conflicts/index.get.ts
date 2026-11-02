export default defineEventHandler(() => {
  const conflicts = useDb().prepare(`select c.*, (select name from users where id = c.decided_by) decided_by_name from conflicts c
    where c.project_id = ? order by c.rowid`).all(pid()) as unknown as (ConflictRow & { decided_by_name: string | null })[]
  // Every fact a conflict names, in one listFacts call (one re-check pass), not two per conflict.
  const facts = new Map(listFacts(`id in (select left_fact_id from conflicts where project_id = f.project_id
    union select right_fact_id from conflicts where project_id = f.project_id)`).map(f => [f.id, f]))
  return conflicts.map(c => ({
    ...c,
    left: facts.get(c.left_fact_id)!, // facts are never deleted
    right: facts.get(c.right_fact_id)!,
  }))
})
