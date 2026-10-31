// Images (generated and uploaded) are served only through the project guard: another studio gets 404.
export default defineEventHandler((event) => {
  const i = getImage(getRouterParam(event, 'id')!)
  const data = readPortrait(i.id)
  if (!data) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Image file is missing.' })
  setResponseHeaders(event, { 'content-type': i.mime, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' })
  return data
})
