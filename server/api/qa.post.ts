// Ask may call the live model: 30 questions a minute per person (server/utils/throttle.ts).
const asks = fixedWindow(30, 60_000)

export default defineEventHandler(async (event) => {
  if (asks(access().user.id)) throw createError({ statusCode: 429, statusMessage: 'TOO_MANY_REQUESTS', message: 'Asking too fast. Wait a moment.' })
  const q = optText((await readObject<{ question: string }>(event)).question, 'Question', 500)
  if (!q) throw createError({ statusCode: 400, statusMessage: 'QUESTION_REQUIRED', message: 'Ask a question.' })
  return askCanon(q)
})
