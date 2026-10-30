const STATUSES = ['pending', 'canon', 'rejected', 'superseded']

export default defineEventHandler((event) => {
  const status = String(getQuery(event).status ?? 'canon')
  if (!STATUSES.includes(status)) throw createError({ statusCode: 400, statusMessage: 'BAD_STATUS', message: `status must be one of ${STATUSES.join(', ')}` })
  return listFacts('status = ?', status)
})
