// A person picks this image (generated or uploaded) as the entity's portrait or the document's cover.
export default defineEventHandler((event) => {
  const i = getImage(getRouterParam(event, 'id')!)
  return { id: i.id, applied_at: applyImage(i, imageTarget(i.target_type, i.target_id)) }
})
