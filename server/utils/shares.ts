import { randomBytes } from 'node:crypto'

// Read-only share links. The link token is shown once; only its sha256 is stored (hashToken, as for API tokens).
// A link is bound to one project and serves only that project's story bible.
export const SHARE_PREFIX = 'sbs_'

export interface ShareRow {
  id: string, project_id: string, name: string, token_hash: string, prefix: string, options: string, created_by: string, created_at: string
  expires_at: string | null, revoked_at: string | null, revoked_by: string | null, last_opened_at: string | null, open_count: number
}

export function createShare(name: string, days: number | null, options: BibleOptions) {
  const token = SHARE_PREFIX + randomBytes(24).toString('base64url')
  const id = newId('shr')
  const at = new Date()
  const expires = days ? new Date(at.getTime() + days * 86_400_000).toISOString() : null
  useDb().prepare(`insert into share_links (id, project_id, name, token_hash, prefix, options, created_by, created_at, expires_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, pid(), name, hashToken(token), token.slice(0, 8), JSON.stringify(options), access().user.id, at.toISOString(), expires)
  return { id, token, expires_at: expires }
}

const gone = (statusCode: number, message: string) => createError({ statusCode, statusMessage: statusCode === 410 ? 'EXPIRED' : 'NOT_FOUND', message })

// Token -> the link and an access context for its project, so the bible builder's pid() reads that project only.
// Unknown and revoked links are 404 (a revoked link is indistinguishable from one that never existed); expired ones 410.
export function openShare(event: import('h3').H3Event, token: string) {
  const db = useDb()
  const row = token.startsWith(SHARE_PREFIX) ? db.prepare('select * from share_links where token_hash = ?').get(hashToken(token)) as unknown as ShareRow | undefined : undefined
  if (!row || row.revoked_at) throw gone(404, 'This link doesn’t exist or was turned off.')
  if (row.expires_at && row.expires_at <= now()) throw gone(410, 'This link has expired.')
  const project = db.prepare('select * from projects where id = ?').get(row.project_id) as unknown as ProjectRow | undefined
  if (!project) throw gone(404, 'This link doesn’t exist or was turned off.')
  const studio = db.prepare('select id, name from studios where id = ?').get(project.studio_id) as Access['studio']
  // Not a person: audit rows written in this request name the link, and nothing here can write (the handlers only read).
  event.context.access = { user: { id: `share:${row.id}`, name: 'Share link', email: '' }, project, studio, role: 'viewer' } satisfies Access
  return row
}

export const shareOptions = (row: ShareRow) => JSON.parse(row.options) as BibleOptions
