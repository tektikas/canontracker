// Accept applies atomically: a new canon version supersedes the old fact (kept, never deleted).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { decision, rationale } = await readBody<{ decision?: 'accept' | 'reject', rationale?: string }>(event)
  if (decision !== 'accept' && decision !== 'reject') throw createError({ statusCode: 400, statusMessage: 'BAD_DECISION', message: 'decision must be accept or reject.' })
  if (!rationale?.trim()) throw createError({ statusCode: 400, statusMessage: 'RATIONALE_REQUIRED', message: 'Add a short rationale.' })
  const db = useDb()
  const by = access().user.id
  const change = db.prepare('select * from changes where id = ? and project_id = ?').get(id, pid()) as unknown as ChangeRow | undefined
  if (!change) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Change not found.' })
  if (change.status !== 'ready_for_review') throw createError({ statusCode: 409, statusMessage: 'INVALID_STATE_TRANSITION', message: `Change is ${change.status}.` })

  if (decision === 'reject') {
    tx(() => {
      db.prepare(`update changes set status = 'rejected', decided_at = ?, decision_rationale = ?, decided_by = ? where id = ?`).run(now(), rationale.trim(), by, id)
      audit('change.rejected', 'change', id, { rationale: rationale.trim() })
    })
    return { id, status: 'rejected' }
  }

  if (change.impact_stale)
    throw createError({ statusCode: 409, statusMessage: 'IMPACT_STALE', message: 'A merge changed what this proposal may touch. Re-run the impact analysis and review it before accepting.' })
  const old = getFact(change.target_fact_id)
  if (old.status !== 'canon') throw createError({ statusCode: 409, statusMessage: 'STALE_TARGET', message: 'The target fact is no longer active canon.' })
  const newFactId = newId('fact')
  tx(() => {
    db.prepare(`insert into facts (id, kind, subject, predicate, object, value, statement, t_from, t_to, time_label, precision, status, confidence,
      origin, model_id, version, supersedes_id, created_at, decided_at, rationale, decided_by, project_id)
      select ?, kind, subject, predicate, object, value, ?, t_from, t_to, time_label, precision, 'canon', null, ?, null, version + 1, id, ?, ?, ?, ?, project_id from facts where id = ?`)
      .run(newFactId, change.proposed_statement, `change:${id}`, now(), now(), rationale.trim(), by, old.id)
    // The prior source stays attached so the lineage is visible; it no longer states the new wording.
    db.prepare(`insert into evidence (id, fact_id, document_id, passage_id, quote, verified, support, project_id)
      select 'ev_' || lower(hex(randomblob(8))), ?, document_id, passage_id, quote, verified, 'prior_source', project_id from evidence where fact_id = ?`).run(newFactId, old.id)
    db.prepare(`update facts set status = 'superseded' where id = ?`).run(old.id)
    db.prepare(`update changes set status = 'applied', new_fact_id = ?, decided_at = ?, decision_rationale = ?, decided_by = ? where id = ?`).run(newFactId, now(), rationale.trim(), by, id)
    audit('change.accepted', 'change', id, { rationale: rationale.trim() })
    createTasks(id, change.impact)
    audit('change.applied', 'fact', newFactId, { change_id: id, superseded_fact_id: old.id, before: old.statement, after: change.proposed_statement })
  })
  return { id, status: 'applied', new_fact_id: newFactId, superseded_fact_id: old.id }
})
