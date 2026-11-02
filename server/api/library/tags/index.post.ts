export default defineEventHandler(async (event) => {
  const body = await readObject<{ name?: unknown, color?: unknown }>(event)
  const name = cleanName(body.name, 'tag name', 40)
  const color = cleanColor(body.color ?? 'accent')
  checkTagName(name)
  const id = newId('tag')
  tx(() => {
    useDb().prepare('insert into tags (id, name, color, created_by, created_at, project_id) values (?, ?, ?, ?, ?, ?)').run(id, name, color, access().user.id, now(), pid())
    audit('tag.created', 'tag', id, { name, color })
  })
  return { id, name, color }
})
