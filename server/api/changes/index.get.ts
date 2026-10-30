export default defineEventHandler(() => {
  const rows = useDb().prepare('select * from changes order by rowid desc').all() as unknown as ChangeRow[]
  return rows.map(c => ({ ...c, impact: c.impact ? JSON.parse(c.impact) : [] }))
})
