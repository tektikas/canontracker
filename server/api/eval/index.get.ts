export default defineEventHandler(() => {
  const rows = useDb().prepare('select * from eval_runs order by rowid desc limit 20').all() as { id: string, dataset: string, model_id: string, results: string, created_at: string }[]
  return rows.map(r => ({ ...r, results: JSON.parse(r.results) as EvalMetric[] }))
})
