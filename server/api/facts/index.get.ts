const STATUSES = ['pending', 'canon', 'rejected', 'superseded']

export default defineEventHandler((event) => {
  const status = String(getQuery(event).status ?? 'canon')
  if (!STATUSES.includes(status)) throw createError({ statusCode: 400, statusMessage: 'BAD_STATUS', message: `status must be one of ${STATUSES.join(', ')}` })
  // Pending candidates carry the merge decisions that will rename them on accept, so the reviewer sees them first, and the AI
  // critic's newest opinion (advice only).
  const facts = listFacts('status = ?', status).map(f => ({ ...f, identity: status === 'pending' ? identityOf(f) : [] }))
  return status === 'pending' ? withCritic(facts) : facts.map(f => ({ ...f, critic: null }))
})
