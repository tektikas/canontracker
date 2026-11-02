export interface DraftRow { id: string, filename: string | null, title: string, kind: string, content: string, user_id: string, created_at: string, updated_at: string, base_document_id: string | null }

export const MAX_DRAFT = 1_000_000

// Drafts are private to their author: anyone else, in this studio or another, gets a 404.
export function getDraft(id: string) {
  const d = useDb().prepare('select * from drafts where id = ? and project_id = ? and user_id = ?').get(id, pid(), access().user.id) as unknown as DraftRow | undefined
  if (!d) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Draft not found.' })
  return d
}

// The latest version of a written document, by its filename.
export function latestDocument(filename: string) {
  return useDb().prepare('select * from documents where project_id = ? and filename = ? order by version desc limit 1').get(pid(), filename) as unknown as DocumentRow | undefined
}

export function draftFields(body: Record<string, unknown>) {
  const out: { title?: string, kind?: string, content?: string } = {}
  if (body.title !== undefined) out.title = String(body.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
  if (body.kind !== undefined) {
    if (!DOCUMENT_KINDS.includes(body.kind as typeof DOCUMENT_KINDS[number]))
      throw createError({ statusCode: 400, statusMessage: 'BAD_KIND', message: `kind must be one of ${DOCUMENT_KINDS.join(', ')}.` })
    out.kind = body.kind as string
  }
  if (body.content !== undefined) {
    out.content = String(body.content ?? '').replace(/\r\n?/g, '\n')
    if (Buffer.byteLength(out.content) > MAX_DRAFT) throw createError({ statusCode: 413, statusMessage: 'TOO_LARGE', message: 'Documents can be up to 1 MB.' })
  }
  return out
}
