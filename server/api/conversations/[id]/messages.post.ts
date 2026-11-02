// Post in a conversation: { text, mode?: 'canon' | 'research', context? }. Any member, viewers included. Returns the message
// and the assistant's reply (an answer, a follow-up question, or an error the team can see).
export default defineEventHandler(async (event) => {
  const conv = getConversation(getRouterParam(event, 'id') ?? '')
  const post = await readPost(event)
  return { messages: await postToConversation(conv, post), updated_at: getConversation(conv.id).updated_at }
})
