export default defineEventHandler(() => {
  const conflicts = useDb().prepare('select * from conflicts order by rowid').all() as unknown as ConflictRow[]
  return conflicts.map(c => ({
    ...c,
    left: listFacts('id = ?', c.left_fact_id)[0]!, // facts are never deleted
    right: listFacts('id = ?', c.right_fact_id)[0]!,
  }))
})
