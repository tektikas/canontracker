// Removes the label only; the documents it was on are untouched.
export default defineEventHandler((event) => {
  const tag = getTag(getRouterParam(event, 'id')!)
  const db = useDb()
  const n = (db.prepare('select count(*) n from document_tags where project_id = ? and tag_id = ?').get(pid(), tag.id) as { n: number }).n
  tx(() => {
    db.prepare('delete from document_tags where project_id = ? and tag_id = ?').run(pid(), tag.id)
    db.prepare('delete from tags where id = ?').run(tag.id)
    audit('tag.deleted', 'tag', tag.id, { name: tag.name, color: tag.color, documents: n })
  })
  return { ok: true, documents: n }
})
