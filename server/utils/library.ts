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
  if (ids.length > 500) throw createError({ statusCode: 400, statusMessage: 'TOO_MANY', message: 'Pick at most 500 documents at a time.' })
  const db = useDb()
  const out = new Map<string, DocumentRow>()
  for (const id of ids as string[]) {
    const d = db.prepare('select filename from documents where id = ? and project_id = ?').get(id, pid()) as { filename: string } | undefined
    if (!d) throw notFound('Document')
    out.set(d.filename, latestDocument(d.filename)!)
  }
  return [...out.values()]
}

interface LibraryDocument {
  id: string, title: string, filename: string, name: string, kind: string, version: number, sha256: string, imported_at: string, origin: string
  folder_id: string | null, archived_at: string | null, created_by_name: string | null, passages: number, canon_facts: number, pending_facts: number
}

// One row per document: its latest version, its labels, how many versions it has, who saved the latest, the canon citing
// any version, and of those the facts citing an older version that a person has not re-checked yet (stale_facts; see
// server/utils/recheck.ts), outdated_facts being the ones whose quote is gone from the latest version.
export function latestDocuments() {
  const db = useDb()
  const rows = db.prepare(`select d.id, d.title, d.filename, d.name, d.kind, d.version, d.sha256, d.imported_at, d.origin, d.folder_id, d.archived_at,
    (select name from users u where u.id = d.created_by) created_by_name,
    (select count(*) from passages p where p.document_id = d.id) passages,
    (select count(distinct f.id) from evidence e join facts f on f.id = e.fact_id join documents v on v.id = e.document_id
      where v.project_id = d.project_id and v.filename = d.filename and f.status = 'canon') canon_facts,
    (select count(distinct f.id) from evidence e join facts f on f.id = e.fact_id join documents v on v.id = e.document_id
      where v.project_id = d.project_id and v.filename = d.filename and f.status = 'pending') pending_facts
    from documents d where d.project_id = ?
      and d.version = (select max(version) from documents d2 where d2.project_id = d.project_id and d2.filename = d.filename)
    order by d.rowid`).all(pid()) as unknown as LibraryDocument[]
  const tags = new Map<string, string[]>()
  for (const t of db.prepare('select filename, tag_id from document_tags where project_id = ?').all(pid()) as { filename: string, tag_id: string }[])
    tags.set(t.filename, [...(tags.get(t.filename) ?? []), t.tag_id])
  const stale = new Map<string, Map<string, RecheckState>>()
  for (const c of staleCanonCitations()) {
    const m = stale.get(c.document_key) ?? new Map<string, RecheckState>()
    if (c.state !== 'kept' && m.get(c.fact_id) !== 'outdated') m.set(c.fact_id, c.state)
    stale.set(c.document_key, m)
  }
  return rows.map((r) => {
    const s = [...(stale.get(r.filename)?.values() ?? [])]
    return { ...r, stale_facts: s.length, outdated_facts: s.filter(x => x === 'outdated').length, tags: tags.get(r.filename) ?? [] }
  })
}
