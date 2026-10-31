// Edit an image's caption. Editorial only, like the image itself.
export default defineEventHandler(async (event) => {
  const i = getImage(getRouterParam(event, 'id')!)
  const { caption } = await readBody<{ caption?: unknown }>(event)
  const text = cleanText(caption ?? '', 'Caption', IMAGE_CAPTION_MAX)
  if (text === i.caption) return { id: i.id, caption: text }
  const name = imageTarget(i.target_type, i.target_id).name
  tx(() => {
    useDb().prepare('update images set caption = ? where id = ?').run(text, i.id)
    audit('image.captioned', i.target_type, i.target_id, { name, image: i.id, from: i.caption, to: text })
  })
  return { id: i.id, caption: text }
})
