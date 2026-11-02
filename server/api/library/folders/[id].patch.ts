export default defineEventHandler(async (event) => {
  const folder = getFolder(getRouterParam(event, 'id')!)
  const name = cleanName((await readObject<{ name?: unknown }>(event)).name, 'folder name', 60)
  if (name === folder.name) return folder
  checkFolderName(name, folder.parent_id, folder.id)
  tx(() => {
    useDb().prepare('update folders set name = ? where id = ?').run(name, folder.id)
    audit('folder.renamed', 'folder', folder.id, { from: folder.name, to: name })
  })
  return { ...folder, name }
})
