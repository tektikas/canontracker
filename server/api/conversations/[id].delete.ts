// Delete a conversation and its messages: the person who started it (editor and up; viewers can't, like rename) or a studio
// admin or owner. Audited with its title and message count. Research notes and continuity runs it showed are records of their
// own and stay; canon is never touched.
export default defineEventHandler((event) => {
  const conv = getConversation(getRouterParam(event, 'id') ?? '')
  if (!canDeleteConversation(conv)) throw createError({ statusCode: 403, statusMessage: 'FORBIDDEN', message: 'Only the person who started this conversation, or a studio admin, can delete it.' })
  tx(() => {
    const messages = useDb().prepare('delete from messages where conversation_id = ? and project_id = ?').run(conv.id, pid()).changes
    useDb().prepare('delete from conversations where id = ? and project_id = ?').run(conv.id, pid())
    audit('conversation.deleted', 'conversation', conv.id, { title: conv.title, messages })
  })
  return { ok: true }
})
