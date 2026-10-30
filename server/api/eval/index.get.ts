export default defineEventHandler(() => {
  const rows = useDb().prepare('select * from eval_runs where project_id = ? order by rowid desc limit 20').all(pid()) as { id: string, dataset: string, model_id: string, results: string, created_at: string }[]
  return rows.map(r => ({ ...r, results: JSON.parse(r.results) as EvalMetric[] }))
})
