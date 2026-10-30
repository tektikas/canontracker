// Merge this page (the duplicate) into another. { into, preview: true } returns the plan without writing anything.
export default defineEventHandler(async (event) => {
  const src = getEntity(getRouterParam(event, 'id')!)
  const body = await readBody<{ into?: string, preview?: boolean }>(event)
  const dst = getEntity(String(body.into ?? ''))
  const { apply, ...plan } = planMerge(src, dst)
  if (body.preview) return plan

  const d = useDb()
  const repoint = (n: string | null) => (n && apply.srcNames.has(normName(n)) ? dst.name : n)
  tx(() => {
    const upd = d.prepare('update facts set subject = ?, object = ? where id = ?')
    for (const f of plan.facts) upd.run(repoint(f.subject), repoint(f.object), f.id)
    d.prepare(`update entities set aliases = ?, fields = ?, summary = ?, notes = ?, updated_at = ?, updated_by = ? where id = ?`)
      .run(JSON.stringify(apply.aliases), JSON.stringify(apply.fields), apply.summary, apply.notes, now(), access().user.id, dst.id)
    if (plan.portrait === 'move') d.prepare('update entities set portrait_type = ?, portrait_at = ? where id = ?').run(src.portrait_type, now(), dst.id)
    d.prepare('delete from entities where id = ?').run(src.id)
    // The before-values of every re-pointed fact and the full source page, so the merge can be traced and undone by hand.
    audit('entity.merged', 'entity', dst.id, {
      from: snapshot(src), into: dst.name, aliases_added: plan.aliases_added, fields_filled: plan.fields_filled, portrait: plan.portrait,
      facts: plan.facts.map(f => ({ id: f.id, subject: f.subject, object: f.object })),
    })
  })
  if (plan.portrait === 'move') movePortrait(src.id, dst.id)
  else removePortrait(src.id)
  return { id: dst.id, facts: plan.facts.length }
})
