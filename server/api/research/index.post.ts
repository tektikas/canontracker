// Ask a research question outside a conversation (the /research page). Editors+ (research calls the live model with web
// search; viewers ask canon, or research in conversations). Limited by researchThrottle. history: the turns before this one on the page, so a follow-up answer continues the question.
export default defineEventHandler(async (event) => {
  const b = await readObject<{ question: string, history: unknown }>(event)
  const question = optText(b.question, 'Question', 2000)
  if (!question) throw createError({ statusCode: 400, statusMessage: 'QUESTION_REQUIRED', message: 'Ask a question.' })
  if (b.history != null && !Array.isArray(b.history)) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'history must be a list.' })
  const user = access().user
  const history = ((b.history ?? []) as unknown[]).slice(-10).map((h) => {
    const r = h as Record<string, unknown> | null
    if (!r || (r.role !== 'user' && r.role !== 'assistant')) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'Each history turn needs role user or assistant.' })
    return { role: r.role as 'user' | 'assistant', mode: 'research' as const, author: r.role === 'user' ? user.name : '', text: optText(r.text, 'History text', 4000) }
  })
  researchThrottle()
  const result = await runResearch({ projectId: pid(), conversationId: '', question, history, context: [], profile: null })
  return { ...result, notes: (result.noteIds ?? []).map(getResearchNote) }
})
