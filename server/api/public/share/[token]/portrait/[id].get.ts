// A portrait shown on a share page: only when the link includes images and the page is one the link's bible shows.
export default defineEventHandler(event => shareReply(event, () => {
  const row = openShare(event, getRouterParam(event, 'token')!)
  const opts = shareOptions(row)
  const id = getRouterParam(event, 'id')!
  const { rows } = buildBible({ ...opts, sections: ['entities'] }, () => '')
  const e = [...rows.values()].find(r => r.id === id)
  const data = opts.images && e?.portrait_type ? readPortrait(e.id) : null
  if (!data) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'No portrait.' })
  setHeaders(event, { 'content-type': e!.portrait_type!, 'x-content-type-options': 'nosniff' })
  return data
}))
