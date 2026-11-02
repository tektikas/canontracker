// Rename a conversation: { title }. Editors and up (viewers may post but not rename).
export default defineEventHandler(async (event) => {
  const conv = getConversation(getRouterParam(event, 'id') ?? '')
  const title = cleanName((await readObject<{ title: string }>(event)).title, 'title', 120)
  if (title !== conv.title) {
    tx(() => {
      useDb().prepare('update conversations set title = ?, updated_at = ? where id = ?').run(title, now(), conv.id)
      audit('conversation.renamed', 'conversation', conv.id, { from: conv.title, to: title })
    })
  }
  return conversationWithMessages(getConversation(conv.id)).conversation
})
