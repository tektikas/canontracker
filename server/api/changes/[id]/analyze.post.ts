// Re-runs impact analysis on a proposal whose impact a merge made stale. Canon is not touched.
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const change = db.prepare('select * from changes where id = ? and project_id = ?').get(id, pid()) as unknown as ChangeRow | undefined
  if (!change) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Change not found.' })
  if (change.status !== 'ready_for_review') throw createError({ statusCode: 409, statusMessage: 'INVALID_STATE_TRANSITION', message: `Change is ${change.status}.` })
  const impact = analyzeImpact(change.target_fact_id)
  tx(() => {
    db.prepare('update changes set impact = ?, impact_stale = null where id = ?').run(JSON.stringify(impact), id)
    audit('impact.completed', 'change', id, { items: impact.length, documents: impact.filter(i => i.target_type === 'document').map(i => i.label), scenes: impact.filter(i => i.kind === 'scene').map(i => i.label), max_hops: 2, rerun: true })
  })
  return { id, status: change.status, impact }
})
