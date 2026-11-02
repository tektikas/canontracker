export default defineEventHandler(async (event) => {
  const tag = getTag(getRouterParam(event, 'id')!)
  const body = await readObject<{ name?: unknown, color?: unknown }>(event)
  const name = body.name === undefined ? tag.name : cleanName(body.name, 'tag name', 40)
  const color = body.color === undefined ? tag.color : cleanColor(body.color)
  if (name === tag.name && color === tag.color) return tag
  checkTagName(name, tag.id)
  tx(() => {
    useDb().prepare('update tags set name = ?, color = ? where id = ?').run(name, color, tag.id)
    audit('tag.updated', 'tag', tag.id, { from: { name: tag.name, color: tag.color }, to: { name, color } })
  })
  return { id: tag.id, name, color }
})
