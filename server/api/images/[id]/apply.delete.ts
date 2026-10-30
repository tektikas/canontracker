// Stop using this image as the document's cover. The image stays in the history. (Portraits are removed on the entity page.)
export default defineEventHandler((event) => {
  const i = getImage(getRouterParam(event, 'id')!)
  if (i.target_type !== 'document') throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'Remove a portrait from the entity page.' })
  if (!i.applied_at) return { id: i.id, applied_at: null }
  tx(() => {
    clearApplied('document', i.target_id)
    audit('image.cover_removed', 'document', i.target_id, { image: i.id })
  })
  return { id: i.id, applied_at: null }
})
