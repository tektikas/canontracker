const STATUSES = ['pending', 'canon', 'rejected', 'superseded']

// ?doc=<document id, any version> narrows to facts citing that document (every version of its file); ?folder=<folder id> to
// facts citing a document in that Library folder or a folder inside it. Both may be given; unknown ids match nothing.
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const status = String(q.status ?? 'canon')
  if (!STATUSES.includes(status)) throw createError({ statusCode: 400, statusMessage: 'BAD_STATUS', message: `status must be one of ${STATUSES.join(', ')}` })
  const where = ['status = ?']
  const params = [status]
  const cites = (cond: string) => `exists (select 1 from evidence e join documents d on d.id = e.document_id where e.fact_id = f.id and ${cond})`
  if (typeof q.doc === 'string' && q.doc) {
    where.push(cites('d.filename = (select x.filename from documents x where x.id = ? and x.project_id = f.project_id)'))
    params.push(q.doc)
  }
  if (typeof q.folder === 'string' && q.folder) {
    where.push(cites('d.folder_id in (select id from folders where project_id = f.project_id and (id = ? or parent_id = ?))'))
    params.push(q.folder, q.folder)
  }
  // Pending candidates carry the merge decisions that will rename them on accept, so the reviewer sees them first, and the AI
  // critic's newest opinion (advice only).
  const facts = listFacts(where.join(' and '), ...params).map(f => ({ ...f, identity: status === 'pending' ? identityOf(f) : [] }))
  return status === 'pending' ? withCritic(facts) : facts.map(f => ({ ...f, critic: null }))
})
