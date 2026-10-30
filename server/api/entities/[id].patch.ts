// Edit a page's editorial metadata. Renaming keeps the old name as an alias while canon still uses it, so facts stay linked.
export default defineEventHandler(async (event) => {
  const e = getEntity(getRouterParam(event, 'id')!)
  const body = await readBody<Record<string, unknown>>(event)
  const before = { name: e.name, kind: e.kind, summary: e.summary, aliases: aliasesOf(e), fields: fieldsOf(e), notes: e.notes }
  const after = { ...before }
  if (body.name !== undefined) after.name = cleanName(body.name, 'name')
  if (body.kind !== undefined) after.kind = cleanKind(body.kind)
  if (body.summary !== undefined) after.summary = cleanText(body.summary, 'Summary', 2000)
  if (body.notes !== undefined) after.notes = cleanText(body.notes, 'Notes', 20000)
  if (body.fields !== undefined) after.fields = cleanFields(body.fields, before.fields)
  if (body.aliases !== undefined || after.name !== before.name) {
    const list = body.aliases !== undefined ? body.aliases : before.aliases
    const renamed = normName(after.name) !== normName(before.name) && factsAbout(e, ['canon', 'pending']).some(f => [f.subject, f.object].some(n => normName(n) === normName(before.name)))
    after.aliases = cleanAliases(renamed ? [...(list as unknown[]), before.name] : list, after.name)
  }
  assertNamesFree([after.name, ...after.aliases], e.id)

  const changed = (Object.keys(after) as (keyof typeof after)[]).filter(k => JSON.stringify(after[k]) !== JSON.stringify(before[k]))
  if (!changed.length) return { id: e.id, changed }
  tx(() => {
    useDb().prepare(`update entities set name = ?, kind = ?, summary = ?, aliases = ?, fields = ?, notes = ?, updated_at = ?, updated_by = ? where id = ?`)
      .run(after.name, after.kind, after.summary, JSON.stringify(after.aliases), JSON.stringify(after.fields), after.notes, now(), access().user.id, e.id)
    audit('entity.updated', 'entity', e.id, {
      name: after.name, changed,
      before: Object.fromEntries(changed.map(k => [k, before[k]])), after: Object.fromEntries(changed.map(k => [k, after[k]])),
    })
  })
  return { id: e.id, changed, aliases: after.aliases }
})
