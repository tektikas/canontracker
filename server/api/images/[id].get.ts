// Images (generated and uploaded) are served only through the project guard: another studio gets 404.
// ?download=1 saves the original as a file named after it, with the extension of its real type; otherwise it shows inline.
export default defineEventHandler((event) => {
  const i = getImage(getRouterParam(event, 'id')!)
  const data = readPortrait(i.id)
  if (!data) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Image file is missing.' })
  setResponseHeaders(event, { 'content-type': i.mime, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' })
  if (getQuery(event).download === '1') {
    const ext = i.mime === 'image/jpeg' ? 'jpg' : i.mime.split('/')[1]
    const base = (i.filename ?? '').replace(/\.[^.]*$/, '').trim() || `image-${i.id.slice(-6)}`
    setResponseHeader(event, 'content-disposition', attachment(`${base}.${ext}`, `image-${i.id.slice(-6)}`))
  }
  return data
})
