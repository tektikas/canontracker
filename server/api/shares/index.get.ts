// The project's share links (anyone in the project may see them). The link itself is never stored, so only its prefix is listed.
export default defineEventHandler(() => {
  const rows = useDb().prepare(`select s.*, coalesce(u.name, 'Unknown user') created_by_name from share_links s left join users u on u.id = s.created_by
    where s.project_id = ? order by s.created_at desc`).all(pid()) as unknown as (ShareRow & { created_by_name: string })[]
  const at = now()
  return rows.map(({ token_hash, options, ...r }) => {
    const o = JSON.parse(options) as BibleOptions
    return { ...r, options: o, status: r.revoked_at ? 'revoked' : r.expires_at && r.expires_at <= at ? 'expired' : 'active' }
  })
})
