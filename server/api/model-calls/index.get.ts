// A private draft's continuity check (server/utils/continuity.ts) is listed for its author only.
export default defineEventHandler(() => {
  const rows = useDb().prepare(`select * from model_calls m where project_id = ? and not exists (select 1 from continuity_runs c
    where m.target_type = 'continuity' and c.id = m.target_id and not (${continuityVisible('c')})) order by rowid desc limit 200`).all(pid(), access().user.id) as unknown as ModelCallRow[]
  return rows.map(r => ({ ...r, input_refs: JSON.parse(r.input_refs) as string[] }))
})
