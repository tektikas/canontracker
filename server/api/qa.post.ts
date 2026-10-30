export default defineEventHandler(async (event) => {
  const { question } = await readBody<{ question?: string }>(event)
  const q = question?.trim()
  if (!q) throw createError({ statusCode: 400, statusMessage: 'QUESTION_REQUIRED', message: 'Ask a question.' })
  return askCanon(q)
})
