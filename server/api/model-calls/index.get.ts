export default defineEventHandler(() => {
  const rows = useDb().prepare('select * from model_calls where project_id = ? order by rowid desc limit 200').all(pid()) as unknown as ModelCallRow[]
  return rows.map(r => ({ ...r, input_refs: JSON.parse(r.input_refs) as string[] }))
})
