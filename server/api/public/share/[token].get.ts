// The bible behind a share link, for anyone holding the link. Same builder as the export; nothing else of the project.
// Every open is counted on the link; only the first is written to the audit trail, so a busy link doesn't flood it.
export default defineEventHandler((event) => {
  setHeaders(event, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' })
  const token = getRouterParam(event, 'token')!
  const row = openShare(event, token)
  const { bible } = buildBible(shareOptions(row), e => `/api/public/share/${encodeURIComponent(token)}/portrait/${e.id}?v=${encodeURIComponent(e.portrait_at ?? '')}`)
  tx(() => {
    useDb().prepare('update share_links set open_count = open_count + 1, last_opened_at = ? where id = ?').run(now(), row.id)
    if (!row.open_count) audit('share.opened', 'share', row.id, { name: row.name })
  })
  return { ...bible, expires_at: row.expires_at }
})
