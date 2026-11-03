// Revert restores the original wording as a new canon version. Nothing is deleted; both earlier versions stay superseded.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const rationale = optText((await readObject<{ rationale: string }>(event)).rationale, 'Rationale', 2000)
  if (!rationale) throw createError({ statusCode: 400, statusMessage: 'RATIONALE_REQUIRED', message: 'Say why the change is reverted.' })
  const db = useDb()
  const by = access().user.id
  const change = db.prepare('select * from changes where id = ? and project_id = ?').get(id, pid()) as unknown as ChangeRow | undefined
  if (!change) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Change not found.' })
  if (change.status !== 'applied') throw createError({ statusCode: 409, statusMessage: 'INVALID_STATE_TRANSITION', message: `Change is ${change.status}; only applied changes can be reverted.` })
  const current = getFact(change.new_fact_id!)
  if (current.status !== 'canon')
    throw createError({ statusCode: 409, statusMessage: 'STALE_TARGET', message: 'The fact was changed again after this proposal; revert the later change first.' })

  const revertedId = newId('fact')
  tx(() => {
    db.prepare(`insert into facts (id, kind, subject, predicate, object, value, statement, t_from, t_to, time_label, precision, status, confidence,
      origin, model_id, version, supersedes_id, created_at, decided_at, rationale, decided_by, decided_token, project_id)
      select ?, kind, subject, predicate, object, value, ?, t_from, t_to, time_label, precision, 'canon', null, ?, null, version + 1, id, ?, ?, ?, ?, ?, project_id from facts where id = ?`)
      .run(revertedId, change.before_statement, `revert:${id}`, now(), now(), rationale, by, agentToken(), current.id)
    // The original wording is back, so the original sources state it again.
    db.prepare(`insert into evidence (id, fact_id, document_id, passage_id, quote, verified, support, project_id)
      select 'ev_' || lower(hex(randomblob(8))), ?, document_id, passage_id, quote, verified, support, project_id from evidence where fact_id = ?`)
      .run(revertedId, change.target_fact_id)
    db.prepare(`update facts set status = 'superseded' where id = ?`).run(current.id)
    db.prepare(`update changes set status = 'reverted', reverted_fact_id = ?, reverted_at = ?, revert_rationale = ?, reverted_by = ?, reverted_token = ? where id = ?`)
      .run(revertedId, now(), rationale, by, agentToken(), id)
    closeTasks(id)
    audit('change.reverted', 'change', id, { rationale: rationale, superseded_fact_id: current.id, restored_fact_id: revertedId, restored: change.before_statement })
  })
  return { id, status: 'reverted', restored_fact_id: revertedId }
})
