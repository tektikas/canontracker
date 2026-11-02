// The project's conversations, newest activity first. ?q= matches titles and message text. Every member sees every one.
export default defineEventHandler((event) => {
  const q = String(getQuery(event).q ?? '').trim().slice(0, 80)
  return listConversations(q)
})
