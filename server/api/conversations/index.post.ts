// A new conversation starts with its first message: { text, mode?: 'canon' | 'research', context? }. The title is the first
// question (editable). Returns the conversation with the first question and its answer.
export default defineEventHandler(async (event) => {
  const post = await readPost(event)
  const conv = createConversation(post)
  await postToConversation(conv, post)
  return conversationWithMessages(getConversation(conv.id))
})
