// Starts a draft. With document_id it edits that document (written or uploaded; the save is the next version, origin 'written'): the caller's open draft for it if there is one,
// otherwise a new draft holding the latest version's text.
export default defineEventHandler(async (event) => {
  const body = (await readBody<Record<string, unknown>>(event)) ?? {}
  const db = useDb()
  const user = access().user.id
  let filename: string | null = null
  let base = { title: '', kind: 'scene', content: '' }
  if (body.document_id) {
    const doc = db.prepare('select * from documents where id = ? and project_id = ?').get(String(body.document_id), pid()) as unknown as DocumentRow | undefined
    if (!doc) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Document not found.' })
    filename = doc.filename
    const open = db.prepare('select id from drafts where project_id = ? and user_id = ? and filename = ?').get(pid(), user, filename) as { id: string } | undefined
    if (open) return getDraft(open.id)
    const latest = latestDocument(filename)!
    base = { title: latest.title, kind: latest.kind, content: latest.content }
  }
  const f = { ...base, ...draftFields(body) }
  const id = newId('drf')
  db.prepare('insert into drafts (id, filename, title, kind, content, user_id, created_at, updated_at, project_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, filename, f.title, f.kind, f.content, user, now(), now(), pid())
  return getDraft(id)
})
