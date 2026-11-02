// A writer creates a page by hand (a character not in canon yet, a faction, a quest).
export default defineEventHandler(async (event) => {
  const body = await readObject<{ name?: unknown, kind?: unknown, summary?: unknown }>(event)
  const name = cleanName(body.name, 'name')
  const summary = cleanText(body.summary ?? '', 'Summary', 2000)
  const id = newId('ent')
  const { user } = access()
  tx(() => {
    const kind = cleanKind(body.kind) // under the write lock: a type removed by another process can't be used
    assertNamesFree([name])
    useDb().prepare(`insert into entities (id, name, kind, summary, origin, created_at, created_by, updated_at, updated_by, project_id)
      values (?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?)`).run(id, name, kind, summary, now(), user.id, now(), user.id, pid())
    audit('entity.created', 'entity', id, { name, kind })
  })
  return { id }
})
