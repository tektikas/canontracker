// One conversation with every message. ?since=<updated_at> answers { unchanged: true } when nothing was posted since, so
// open chats can poll cheaply for teammates' messages.
export default defineEventHandler((event) => {
  const conv = getConversation(getRouterParam(event, 'id') ?? '')
  if (getQuery(event).since === conv.updated_at) return { unchanged: true as const, updated_at: conv.updated_at }
  return conversationWithMessages(conv)
})
