export default defineEventHandler((event) => {
  const d = getDraft(getRouterParam(event, 'id')!)
  useDb().prepare('delete from drafts where id = ?').run(d.id)
  return { id: d.id, deleted: true }
})
