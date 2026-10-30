// Deleting a page never touches canon. While canon or pending candidates still name it, it can't go (it would be re-filed);
// merge it into another page instead.
export default defineEventHandler((event) => {
  const e = getEntity(getRouterParam(event, 'id')!)
  const n = factsAbout(e, ['canon', 'pending']).length
  if (n) throw createError({ statusCode: 409, statusMessage: 'IN_USE', message: `${n} canon fact${n === 1 ? '' : 's'} or candidate${n === 1 ? '' : 's'} still name ${e.name}. Merge it into another page instead.` })
  tx(() => {
    useDb().prepare('delete from entities where id = ?').run(e.id)
    audit('entity.deleted', 'entity', e.id, { name: e.name, entity: snapshot(e) })
  })
  removePortrait(e.id)
  return { id: e.id }
})
