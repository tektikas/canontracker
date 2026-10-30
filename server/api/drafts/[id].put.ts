// Autosave. Only the author's own draft; nothing here touches a document.
export default defineEventHandler(async (event) => {
  const d = getDraft(getRouterParam(event, 'id')!)
  const f = draftFields((await readBody<Record<string, unknown>>(event)) ?? {})
  const next = { title: f.title ?? d.title, kind: f.kind ?? d.kind, content: f.content ?? d.content }
  const at = now()
  useDb().prepare('update drafts set title = ?, kind = ?, content = ?, updated_at = ? where id = ?').run(next.title, next.kind, next.content, at, d.id)
  return { id: d.id, updated_at: at }
})
