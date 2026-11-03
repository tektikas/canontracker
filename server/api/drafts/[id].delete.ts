export default defineEventHandler((event) => {
  const d = getDraft(getRouterParam(event, 'id')!)
  tx(() => {
    useDb().prepare('delete from drafts where id = ?').run(d.id)
    agentAudit('draft.deleted', 'draft', d.id, { title: d.title })
  })
  return { id: d.id, deleted: true }
})
