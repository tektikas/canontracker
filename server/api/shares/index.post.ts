// Creates a read-only share link for the current project's story bible. Editors and up: it publishes canon outside the studio.
// The link is in this response only.
export default defineEventHandler(async (event) => {
  requireRole('editor')
  const body = await readObject<Record<string, unknown>>(event)
  const name = cleanName(body.name, 'link name', 80)
  const days = body.days == null ? null : Number(body.days)
  if (days !== null && !SHARE_EXPIRY.some(e => e.days === days)) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'Pick 7 days, 30 days or never.' })
  const options = cleanBibleOptions((body.options ?? {}) as Record<string, unknown>)
  const { bible } = buildBible(options, portraitUrl)
  const share = createShare(name, days, options)
  audit('share.created', 'share', share.id, { name, expires_at: share.expires_at, scope: bible.scope.label, sections: options.sections, images: options.images, facts: bible.counts.facts })
  return { id: share.id, name, token: share.token, expires_at: share.expires_at }
})
