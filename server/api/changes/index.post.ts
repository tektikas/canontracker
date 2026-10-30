// Creates a draft proposal and runs bounded impact analysis on it. Canon is not touched.
export default defineEventHandler(async (event) => {
  const { target_fact_id, proposed_statement, rationale } = await readBody<{ target_fact_id?: string, proposed_statement?: string, rationale?: string }>(event)
  const target = getFact(target_fact_id ?? '')
  if (target.status !== 'canon') throw createError({ statusCode: 409, statusMessage: 'NOT_CANON', message: 'Only active canon facts can be changed.' })
  const proposed = proposed_statement?.trim()
  if (!proposed || proposed === target.statement) throw createError({ statusCode: 400, statusMessage: 'NO_CHANGE', message: 'Write the new statement.' })
  if (!rationale?.trim()) throw createError({ statusCode: 400, statusMessage: 'RATIONALE_REQUIRED', message: 'Say why the change is proposed.' })

  const db = useDb()
  const id = newId('chg')
  db.prepare(`insert into changes (id, target_fact_id, before_statement, proposed_statement, rationale, status, created_at, project_id) values (?, ?, ?, ?, ?, 'analyzing', ?, ?)`)
    .run(id, target.id, target.statement, proposed, rationale.trim(), now(), pid())
  audit('change.created', 'change', id, { target_fact_id: target.id, before: target.statement, proposed })

  const impact = analyzeImpact(target.id)
  db.prepare(`update changes set status = 'ready_for_review', impact = ? where id = ?`).run(JSON.stringify(impact), id)
  audit('impact.completed', 'change', id, { items: impact.length, scenes: impact.filter(i => i.target_type === 'scene').map(i => i.label), max_hops: 2 })
  return { id, status: 'ready_for_review', impact }
})
