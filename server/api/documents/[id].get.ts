export default defineEventHandler((event) => {
  const db = useDb()
  const id = getRouterParam(event, 'id')
  const doc = db.prepare('select * from documents where id = ? and project_id = ?').get(id!, pid()) as unknown as DocumentRow | undefined
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Document not found.' })
  const passages = db.prepare('select * from passages where document_id = ? order by ordinal').all(id!) as unknown as PassageRow[]
  // Facts citing any version of this document; the reader flags those that cite an older one.
  const facts = listFacts(`id in (select e.fact_id from evidence e join documents d on d.id = e.document_id where d.filename = ? and d.project_id = f.project_id)
    and status in ('canon', 'pending')`, doc.filename)
  const latest = latestDocument(doc.filename)!
  const author = doc.created_by ? (db.prepare('select name from users where id = ?').get(doc.created_by) as { name: string } | undefined)?.name ?? null : null
  // Notes from every version of this document. A note made on another version is shown where its words still appear
  // (matched at read time, nothing is moved); `anchor` is null when the text is gone or found in more than one place.
  const versions = new Map<string, PassageRow[]>()
  const passagesOf = (id: string) => versions.get(id) ?? versions.set(id, db.prepare('select * from passages where document_id = ? order by ordinal').all(id) as unknown as PassageRow[]).get(id)!
  const notes = listNotes('d.filename = ?', doc.filename).map(n => ({
    ...n, ...(n.document_id === doc.id ? { anchor: n.passage_id, anchor_issue: null } : reanchorNote(n, passages, passagesOf(n.document_id))),
  }))
  return { ...doc, created_by_name: author, latest: { id: latest.id, version: latest.version }, passages, facts, notes }
})
