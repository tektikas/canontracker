// A person picks this image as the entity's portrait or the document's cover. Editorial only; canon is untouched.
export default defineEventHandler((event) => {
  const i = getImage(getRouterParam(event, 'id')!)
  const target = imageTarget(i.target_type, i.target_id)
  const data = readPortrait(i.id)
  if (!data) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Image file is missing.' })
  const at = now()
  let replaced = false
  // The portrait keeps its own copy, so uploads, merges and the portrait route work exactly as before.
  if (i.target_type === 'entity') {
    replaced = !!getEntity(i.target_id).portrait_type
    savePortrait(i.target_id, data)
  } else replaced = !!appliedImage('document', i.target_id)
  tx(() => {
    if (i.target_type === 'entity')
      useDb().prepare('update entities set portrait_type = ?, portrait_at = ?, updated_at = ?, updated_by = ? where id = ?').run(i.mime, at, at, access().user.id, i.target_id)
    clearApplied(i.target_type, i.target_id)
    useDb().prepare('update images set applied_at = ? where id = ?').run(at, i.id)
    audit('image.applied', i.target_type, i.target_id, { name: target.name, image: i.id, as: target.noun, replaced })
  })
  return { id: i.id, applied_at: at }
})
