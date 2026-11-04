import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'

export const TOKEN_PREFIX = 'sb_'
export const hashToken = (secret: string) => createHash('sha256').update(secret).digest('hex')

// level: propose = reads, proposals and model runs (research, continuity, critic, extraction); full = also editorial writes its
// owner's live role allows (documents, drafts, notes, entity pages, library, images), marked "via agent <name>". No level makes
// a canon or identity decision: those are a person's, in the web app (requireHuman). Fixed at creation.
export interface TokenRow { id: string, user_id: string, project_id: string, name: string, token_hash: string, prefix: string, created_at: string, last_used_at: string | null, revoked_at: string | null, level: TokenLevel }

// The secret is returned once; only its sha256 is stored.
export function createApiToken(a: Access, name: string, level: TokenLevel = 'propose') {
  const secret = TOKEN_PREFIX + randomBytes(24).toString('base64url')
  const id = newId('tok')
  useDb().prepare('insert into api_tokens (id, user_id, project_id, name, token_hash, prefix, created_at, level) values (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, a.user.id, a.project.id, name, hashToken(secret), secret.slice(0, 7), now(), level)
  return { id, secret }
}

// Bearer token -> the same Access the web guard builds: that user's live role in the token's project. Null when the token is unknown, revoked or its owner left the studio.
export function accessForToken(event: H3Event): { access: Access, token: TokenRow } | null {
  const secret = getRequestHeader(event, 'authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!secret?.startsWith(TOKEN_PREFIX)) return null
  const db = useDb()
  const token = db.prepare('select * from api_tokens where token_hash = ? and revoked_at is null').get(hashToken(secret)) as unknown as TokenRow | undefined
  if (!token) return null
  const user = db.prepare('select id, name, email from users where id = ?').get(token.user_id) as Access['user'] | undefined
  const project = db.prepare('select * from projects where id = ?').get(token.project_id) as unknown as ProjectRow | undefined
  const role = user && project && roleIn(project.studio_id, user.id)
  if (!user || !project || !role) return null
  const studio = db.prepare('select id, name from studios where id = ?').get(project.studio_id) as Access['studio']
  db.prepare('update api_tokens set last_used_at = ? where id = ?').run(now(), token.id)
  return { access: { user, project, studio, role, agent: { token_id: token.id, token_name: token.name, level: token.level } }, token }
}
