// Agent activity ("receipts"): every AI run in the project, newest first: which agent, model, prompt version and effort, each
// step (tool, arguments, result summary, latency, tokens), the outcome, and what people did with it afterwards. A run is one
// model_calls row, or for a multi-step agent run (rows with a step index: research, continuity) every row of its target.
// ?run=<target id> returns that run only, with full step inputs; ?purpose= filters. A private draft's continuity check is
// listed for its author only. ponytail: reads the newest 1,000 rows; page by rowid if a project's history outgrows that.
const AGENTS: Record<string, string> = { extract: 'Extractor', critic: 'Critic', research: 'Research', continuity: 'Continuity', answer: 'Ask', rule_check: 'Rule check', image: 'Images', transcribe: 'Transcribe' }

export default defineEventHandler((event) => {
  const q = getQuery(event)
  const one = typeof q.run === 'string' && q.run ? q.run : null
  const purpose = typeof q.purpose === 'string' && q.purpose in AGENTS ? q.purpose : null
  const db = useDb()
  const rows = db.prepare(`select m.* from model_calls m where m.project_id = ? and (? is null or m.target_id = ?) and (? is null or m.purpose = ?)
    and not exists (select 1 from continuity_runs c where m.target_type = 'continuity' and c.id = m.target_id and not (${continuityVisible('c')}))
    order by m.rowid desc limit 1000`).all(pid(), one, one, purpose, purpose, access().user.id) as unknown as ModelCallRow[]

  const runs = new Map<string, ModelCallRow[]>()
  for (const r of rows) {
    const key = r.step == null ? r.id : `${r.purpose}:${r.target_type}:${r.target_id}`
    runs.set(key, [...(runs.get(key) ?? []), r])
  }

  const statuses = (sql: string, ...args: string[]) => Object.fromEntries((db.prepare(sql).all(pid(), ...args) as { status: string, n: number }[]).map(s => [s.status, s.n]))
  // What people did with the run's output: the candidates it led to (accepted = canon or later superseded), or the conflicts it raised.
  function outcome(r: ModelCallRow): { facts?: Record<string, number>, conflicts?: Record<string, number> } | null {
    const t = r.target_id
    if (r.purpose === 'extract') return { facts: statuses(`select status, count(*) n from facts f where f.project_id = ? and f.origin like 'model:%' and exists (select 1 from evidence e where e.fact_id = f.id and e.document_id = ?) group by status`, t) }
    if (r.purpose === 'critic') {
      const ids = JSON.parse(r.input_refs) as string[]
      return { facts: ids.length ? statuses(`select status, count(*) n from facts where project_id = ? and id in (select value from json_each(?)) group by status`, JSON.stringify(ids)) : {} }
    }
    if (r.purpose === 'research' || r.purpose === 'continuity') return { facts: statuses(`select status, count(*) n from facts where project_id = ? and origin = ? group by status`, `${r.purpose}:${t}`) }
    if (r.purpose === 'rule_check') return { conflicts: statuses(`select status, count(*) n from conflicts where project_id = ? and origin = 'model' and (left_fact_id = ? or right_fact_id = ?) group by status`, t, t) }
    return null
  }

  // What the run was about, in a few words: the checked text, the research question, the document.
  const about = (r: ModelCallRow) => {
    const row = r.purpose === 'continuity' ? db.prepare('select text t from continuity_runs where id = ?').get(r.target_id)
      : r.purpose === 'research' ? db.prepare('select question t from research_notes where id = ?').get(r.target_id)
      : r.target_type === 'document' ? db.prepare('select title t from documents where id = ?').get(r.target_id) : undefined
    const t = (row as { t: string } | undefined)?.t.replace(/\s+/g, ' ')
    return t ? (t.length > 90 ? `${t.slice(0, 89)}…` : t) : null
  }

  return [...runs.values()].slice(0, one ? 1 : 150).map((all) => {
    const steps = all.toReversed()
    const first = steps[0]!
    const cut = (s: string | null) => (s && !one && s.length > 300 ? `${s.slice(0, 299)}…` : s)
    return {
      id: first.step == null ? first.id : first.target_id, purpose: first.purpose, agent: AGENTS[first.purpose] ?? first.purpose,
      target_type: first.target_type, target_id: first.target_id, started_at: first.created_at, about: about(first),
      model_id: [...new Set(steps.map(s => s.model_id))].join(' + '), prompt_version: first.prompt_version, effort: steps.find(s => s.effort)?.effort ?? null,
      status: steps.some(s => s.status === 'failed' && !s.tool) ? 'failed' : 'ok',
      error: steps.findLast(s => s.status === 'failed' && !s.tool)?.error ?? null,
      model_steps: steps.filter(s => !s.tool || s.tool === 'web_search').length, tool_calls: steps.filter(s => s.tool && s.tool !== 'web_search').length,
      latency_ms: steps.reduce((n, s) => n + s.latency_ms, 0), tokens: steps.reduce((n, s) => n + (s.tokens ?? 0), 0) || null,
      outcome: outcome(first),
      steps: steps.map(s => ({ id: s.id, step: s.step, tool: s.tool, status: s.status, input: cut(s.input), result: s.output_summary, error: s.error, latency_ms: s.latency_ms, tokens: s.tokens, inputs: (JSON.parse(s.input_refs) as string[]).length })),
    }
  })
})
