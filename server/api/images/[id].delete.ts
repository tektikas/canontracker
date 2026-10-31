// Delete an image (generated or uploaded) the team doesn't want, file and all. The one in use as portrait or cover stays until something replaces it.
export default defineEventHandler((event) => {
  const i = getImage(getRouterParam(event, 'id')!)
  if (i.applied_at) throw createError({ statusCode: 409, statusMessage: 'IN_USE', message: 'This image is in use. Remove it from the page or pick another one first.' })
  const name = (() => { try { return imageTarget(i.target_type, i.target_id).name } catch { return null } })()
  tx(() => {
    useDb().prepare('delete from images where id = ?').run(i.id)
    audit('image.discarded', i.target_type, i.target_id, { name, image: i.id, source: i.source, prompt: i.prompt, filename: i.filename, caption: i.caption, created_by: i.created_by, created_at: i.created_at })
  })
  removePortrait(i.id)
  return { id: i.id }
})
