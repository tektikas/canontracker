export default defineEventHandler((event) => {
  const db = useDb()
  const id = getRouterParam(event, 'id')
  const doc = db.prepare('select * from documents where id = ? and project_id = ?').get(id!, pid()) as unknown as DocumentRow | undefined
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Document not found.' })
  const passages = db.prepare('select * from passages where document_id = ? order by ordinal').all(id!) as unknown as PassageRow[]
  const facts = listFacts(`id in (select fact_id from evidence where document_id = ?) and status in ('canon', 'pending')`, id!)
  return { ...doc, passages, facts }
})
