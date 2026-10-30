// Portraits are served only through the project guard: another studio gets 404, like for the page itself.
export default defineEventHandler((event) => {
  const e = getEntity(getRouterParam(event, 'id')!)
  const data = e.portrait_type && readPortrait(e.id)
  if (!data) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'No portrait.' })
  setResponseHeaders(event, { 'content-type': e.portrait_type!, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' })
  return data
})
