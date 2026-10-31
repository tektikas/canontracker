// A person picks this image (generated or uploaded) as the entity's portrait or the document's cover.
// `{ undo: true }` (the Undo after removing it) puts the image back and is logged as a restore, not a fresh pick.
export default defineEventHandler(async (event) => {
  const i = getImage(getRouterParam(event, 'id')!)
  const restored = (await readBody<{ undo?: unknown }>(event).catch(() => null))?.undo === true
  return { id: i.id, applied_at: applyImage(i, imageTarget(i.target_type, i.target_id), restored) }
})
