export default defineEventHandler(() => {
  const conflicts = useDb().prepare(`select c.*, (select name from users where id = c.decided_by) decided_by_name from conflicts c
    where c.project_id = ? order by c.rowid`).all(pid()) as unknown as (ConflictRow & { decided_by_name: string | null })[]
  return conflicts.map(c => ({
    ...c,
    left: listFacts('id = ?', c.left_fact_id)[0]!, // facts are never deleted
    right: listFacts('id = ?', c.right_fact_id)[0]!,
  }))
})
