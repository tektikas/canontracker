// Move to a folder, add or remove tags, set the kind, rename: labels on top of the documents, for every version of each.
// The text, hash and passages are never touched (the update below names its columns).
// archived: true hides the documents from the Library (its Archived filter shows them), reading order and book exports; false
// brings them back. Never deletes: canon citing them stays canon. Audited per document (document.archived / document.unarchived).
interface Body { document_ids?: unknown, folder_id?: string | null, add_tags?: string[], remove_tags?: string[], kind?: string, title?: string, archived?: unknown }

export default defineEventHandler(async (event) => {
  const body = await readObject<Body>(event)
  const tagIds = (v: unknown) => {
    if (v === undefined) return []
    if (!Array.isArray(v) || v.length > 50 || v.some(i => typeof i !== 'string')) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'Tags must be a list of up to 50 tag ids.' })
    return v as string[]
  }
  const docs = latestOf(body.document_ids)
  const db = useDb()
  const detail: Record<string, unknown> = { documents: docs.map(d => ({ id: d.id, filename: d.name, title: d.title })) }
  const sets: string[] = []
  const args: (string | null)[] = []

  if (body.folder_id !== undefined) {
    const to = body.folder_id ? getFolder(idOf(body.folder_id)).id : null
    checkFileNames(docs, to)
    sets.push('folder_id = ?')
    args.push(to)
    detail.folder = { to: folderPath(to), from: [...new Set(docs.map(d => folderPath(d.folder_id)))] }
  }
  if (body.kind !== undefined) {
    if (!DOCUMENT_KINDS.includes(body.kind as typeof DOCUMENT_KINDS[number]))
      throw createError({ statusCode: 400, statusMessage: 'BAD_KIND', message: `kind must be one of ${DOCUMENT_KINDS.join(', ')}.` })
    sets.push('kind = ?', `kind_source = 'person'`) // a person's choice: the AI never changes it afterwards
    args.push(body.kind as string)
    detail.kind = { to: body.kind, from: [...new Set(docs.map(d => d.kind))] }
  }
  if (body.title !== undefined) {
    if (docs.length !== 1) throw createError({ statusCode: 400, statusMessage: 'ONE_DOCUMENT', message: 'Rename one document at a time.' })
    const title = cleanName(body.title, 'title', 120)
    sets.push('title = ?')
    args.push(title)
    detail.title = { from: docs[0]!.title, to: title }
  }
  const add = tagIds(body.add_tags).map(id => getTag(id))
  const remove = tagIds(body.remove_tags).map(id => getTag(id))
  if (add.length) detail.tags_added = add.map(t => t.name)
  if (remove.length) detail.tags_removed = remove.map(t => t.name)
  if (body.archived !== undefined && typeof body.archived !== 'boolean') throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'archived must be true or false.' })
  const archive = body.archived as boolean | undefined
  const labels = !!(sets.length || add.length || remove.length)
  if (!labels && archive === undefined)
    throw createError({ statusCode: 400, statusMessage: 'NOTHING_TO_DO', message: 'Choose a folder, tag, kind, title or archive.' })

  tx(() => {
    if (archive !== undefined) {
      const at = archive ? now() : null
      const by = archive ? access().user.id : null
      const set = db.prepare('update documents set archived_at = ?, archived_by = ? where project_id = ? and filename = ?')
      for (const d of docs) {
        if (!!d.archived_at === archive) continue
        set.run(at, by, pid(), d.filename)
        audit(archive ? 'document.archived' : 'document.unarchived', 'document', d.id, { filename: d.name, title: d.title, folder: folderPath(d.folder_id), version: d.version })
      }
    }
    if (!labels) return
    const update = db.prepare(`update documents set ${sets.join(', ') || 'id = id'} where project_id = ? and filename = ?`)
    const tagAdd = db.prepare('insert or ignore into document_tags (project_id, filename, tag_id) values (?, ?, ?)')
    const tagRemove = db.prepare('delete from document_tags where project_id = ? and filename = ? and tag_id = ?')
    for (const d of docs) {
      if (sets.length) update.run(...args, pid(), d.filename)
      for (const t of add) tagAdd.run(pid(), d.filename, t.id)
      for (const t of remove) tagRemove.run(pid(), d.filename, t.id)
    }
    audit('document.organised', docs.length === 1 ? 'document' : 'library', docs.length === 1 ? docs[0]!.id : newId('lib'), detail)
  })
  return { ok: true, documents: docs.length }
})
