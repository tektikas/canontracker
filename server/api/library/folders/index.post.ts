export default defineEventHandler(async (event) => {
  const body = await readObject<{ name?: unknown, parent_id?: unknown }>(event)
  const name = cleanName(body.name, 'folder name', 60)
  const parentId = typeof body.parent_id === 'string' && body.parent_id ? body.parent_id : null
  if (parentId && getFolder(parentId).parent_id)
    throw createError({ statusCode: 400, statusMessage: 'TOO_DEEP', message: 'Folders go two levels deep. Put this one next to its parent instead.' })
  checkFolderName(name, parentId)
  const id = newId('fld')
  tx(() => {
    useDb().prepare('insert into folders (id, name, parent_id, created_by, created_at, project_id) values (?, ?, ?, ?, ?, ?)').run(id, name, parentId, access().user.id, now(), pid())
    audit('folder.created', 'folder', id, { name, parent: folderPath(parentId) })
  })
  return { id, name, parent_id: parentId }
})
