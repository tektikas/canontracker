export default defineEventHandler((event) => {
  const d = getDraft(getRouterParam(event, 'id')!)
  const latest = d.filename ? latestDocument(d.filename) : undefined
  const base = d.base_document_id ? useDb().prepare('select id, version from documents where id = ? and project_id = ?').get(d.base_document_id, pid()) as { id: string, version: number } | undefined : undefined
  // document: the latest version now; base: the version this draft started from (null when unknown, i.e. a draft from before this was recorded).
  return { ...d, document: latest ? { id: latest.id, title: latest.title, version: latest.version } : null, base: base ?? null }
})
