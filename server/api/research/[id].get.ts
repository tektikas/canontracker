// One research note with its agent trace (every model step and tool run) and the candidates promoted from it.
export default defineEventHandler((event) => {
  const note = getResearchNote(getRouterParam(event, 'id')!)
  const db = useDb()
  const trace = db.prepare(`select id, step, tool, model_id, prompt_version, status, latency_ms, output_summary, error, input, tokens, created_at
    from model_calls where project_id = ? and target_type = 'research' and target_id = ? order by rowid`).all(pid(), note.id) as Pick<ModelCallRow, 'id' | 'step' | 'tool' | 'model_id' | 'prompt_version' | 'status' | 'latency_ms' | 'output_summary' | 'error' | 'input' | 'tokens' | 'created_at'>[]
  const candidates = db.prepare(`select id, kind, statement, status from facts where project_id = ? and origin = ? order by rowid`).all(pid(), `research:${note.id}`) as { id: string, kind: string, statement: string, status: string }[]
  return { ...note, trace, candidates }
})
