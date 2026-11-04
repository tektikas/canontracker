// Creates a draft proposal and runs bounded impact analysis on it. Canon is not touched.
export default defineEventHandler(async (event) => {
  const body = await readObject<{ target_fact_id: string, proposed_statement: string, rationale: string }>(event)
  const target = getFact(idOf(body.target_fact_id))
  if (target.status !== 'canon') throw createError({ statusCode: 409, statusMessage: 'NOT_CANON', message: 'Only active canon facts can be changed.' })
  const proposed = optText(body.proposed_statement, 'Statement', 500)
  if (!proposed || proposed === target.statement) throw createError({ statusCode: 400, statusMessage: 'NO_CHANGE', message: 'Write the new statement.' })
  const rationale = optText(body.rationale, 'Rationale', 2000)
  if (!rationale) throw createError({ statusCode: 400, statusMessage: 'RATIONALE_REQUIRED', message: 'Say why the change is proposed.' })

  const db = useDb()
  const id = newId('chg')
  db.prepare(`insert into changes (id, target_fact_id, before_statement, proposed_statement, rationale, status, created_at, project_id) values (?, ?, ?, ?, ?, 'analyzing', ?, ?)`)
    .run(id, target.id, target.statement, proposed, rationale, now(), pid())
  audit('change.created', 'change', id, { target_fact_id: target.id, before: target.statement, proposed })

  const impact = analyzeImpact(target.id)
  db.prepare(`update changes set status = 'ready_for_review', impact = ? where id = ?`).run(JSON.stringify(impact), id)
  audit('impact.completed', 'change', id, { items: impact.length, documents: impact.filter(i => i.target_type === 'document').map(i => i.label), scenes: impact.filter(i => i.kind === 'scene').map(i => i.label), max_hops: 2 })
  return { id, status: 'ready_for_review', impact }
})
