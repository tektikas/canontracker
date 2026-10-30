const STATUSES = ['pending', 'canon', 'rejected', 'superseded']

export default defineEventHandler((event) => {
  const status = String(getQuery(event).status ?? 'canon')
  if (!STATUSES.includes(status)) throw createError({ statusCode: 400, statusMessage: 'BAD_STATUS', message: `status must be one of ${STATUSES.join(', ')}` })
  // Pending candidates carry the merge decisions that will rename them on accept, so the reviewer sees them first.
  return listFacts('status = ?', status).map(f => ({ ...f, identity: status === 'pending' ? identityOf(f) : [] }))
})
