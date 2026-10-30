// Deleting a folder never deletes documents: they (and any subfolders) move up to where the folder was.
export default defineEventHandler((event) => {
  const folder = getFolder(getRouterParam(event, 'id')!)
  const db = useDb()
  const path = folderPath(folder.id)
  const moved = (db.prepare('select count(distinct filename) n from documents where project_id = ? and folder_id = ?').get(pid(), folder.id) as { n: number }).n
  const subfolders = db.prepare('select id, name from folders where project_id = ? and parent_id = ?').all(pid(), folder.id) as { id: string, name: string }[]
  tx(() => {
    db.prepare('update documents set folder_id = ? where project_id = ? and folder_id = ?').run(folder.parent_id, pid(), folder.id)
    for (const s of subfolders) checkFolderName(s.name, folder.parent_id, s.id)
    db.prepare('update folders set parent_id = ? where project_id = ? and parent_id = ?').run(folder.parent_id, pid(), folder.id)
    db.prepare('delete from folders where id = ?').run(folder.id)
    audit('folder.deleted', 'folder', folder.id, { name: path, documents: moved, subfolders: subfolders.length, to: folderPath(folder.parent_id) })
  })
  return { ok: true, documents: moved, to: folder.parent_id }
})
