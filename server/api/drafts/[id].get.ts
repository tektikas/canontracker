export default defineEventHandler((event) => {
  const d = getDraft(getRouterParam(event, 'id')!)
  const latest = d.filename ? latestDocument(d.filename) : undefined
  return { ...d, document: latest ? { id: latest.id, title: latest.title, version: latest.version } : null }
})
