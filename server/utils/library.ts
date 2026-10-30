// Library organisation: folders, tags and the labels on a document. All editorial: nothing here touches a document's
// text, hash or passages, and a filename's labels are shared by all its versions.
export const TAG_COLORS = ['accent', 'good', 'warn', 'bad', 'pencil'] as const

export interface FolderRow { id: string, name: string, parent_id: string | null }
export interface TagRow { id: string, name: string, color: string }

const notFound = (what: string) => createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: `${what} not found.` })

export function getFolder(id: string) {
  const f = useDb().prepare('select id, name, parent_id from folders where id = ? and project_id = ?').get(id, pid()) as FolderRow | undefined
  if (!f) throw notFound('Folder')
  return f
}
export function getTag(id: string) {
  const t = useDb().prepare('select id, name, color from tags where id = ? and project_id = ?').get(id, pid()) as TagRow | undefined
  if (!t) throw notFound('Tag')
  return t
}
/** "Lore / Islands" */
export function folderPath(id: string | null) {
  if (!id) return null
  const f = getFolder(id)
  return f.parent_id ? `${getFolder(f.parent_id).name} / ${f.name}` : f.name
}

/** Two folders under the same parent can't share a name (case-insensitive). */
export function checkFolderName(name: string, parentId: string | null, except?: string) {
  const clash = useDb().prepare(`select 1 from folders where project_id = ? and parent_id is ? and lower(name) = lower(?) and id is not ?`)
    .get(pid(), parentId, name, except ?? null)
  if (clash) throw createError({ statusCode: 409, statusMessage: 'NAME_TAKEN', message: `There is already a folder called “${name}” here.` })
}
/** Two files with one name can't share a folder: an upload there could not tell which one it is a new version of. */
export function checkFileNames(docs: { name: string, filename: string }[], folderId: string | null) {
  const there = useDb().prepare('select 1 from documents where project_id = ? and folder_id is ? and name = ? and filename != ?')
  const clash = docs.find((d, i) => docs.findIndex(x => x.name === d.name) !== i) ?? docs.find(d => there.get(pid(), folderId, d.name, d.filename))
  if (clash) throw createError({ statusCode: 409, statusMessage: 'NAME_TAKEN', message: `${folderPath(folderId) ?? 'The Library root'} would hold two files called ${clash.name}. Move one of them somewhere else first.` })
}
export function checkTagName(name: string, except?: string) {
  const clash = useDb().prepare('select 1 from tags where project_id = ? and lower(name) = lower(?) and id is not ?').get(pid(), name, except ?? null)
  if (clash) throw createError({ statusCode: 409, statusMessage: 'NAME_TAKEN', message: `There is already a tag called “${name}”.` })
}
export function cleanColor(v: unknown) {
  if (!TAG_COLORS.includes(v as typeof TAG_COLORS[number]))
    throw createError({ statusCode: 400, statusMessage: 'BAD_COLOR', message: `color must be one of ${TAG_COLORS.join(', ')}.` })
  return v as string
}

/** Document ids (any version) → the latest version of each, deduplicated by filename. 404 if any isn't in this project. */
export function latestOf(ids: unknown) {
  if (!Array.isArray(ids) || !ids.length || ids.some(i => typeof i !== 'string'))
    throw createError({ statusCode: 400, statusMessage: 'NO_DOCUMENTS', message: 'Pick at least one document.' })
  const db = useDb()
  const out = new Map<string, DocumentRow>()
  for (const id of ids as string[]) {
    const d = db.prepare('select filename from documents where id = ? and project_id = ?').get(id, pid()) as { filename: string } | undefined
    if (!d) throw notFound('Document')
    out.set(d.filename, latestDocument(d.filename)!)
  }
  return [...out.values()]
}
