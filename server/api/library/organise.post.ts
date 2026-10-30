// Move to a folder, add or remove tags, set the kind, rename: labels on top of the documents, for every version of each.
// The text, hash and passages are never touched (the update below names its columns).
interface Body { document_ids?: unknown, folder_id?: string | null, add_tags?: string[], remove_tags?: string[], kind?: string, title?: string }

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const docs = latestOf(body.document_ids)
  const db = useDb()
  const detail: Record<string, unknown> = { documents: docs.map(d => ({ id: d.id, filename: d.name, title: d.title })) }
  const sets: string[] = []
  const args: (string | null)[] = []

  if (body.folder_id !== undefined) {
    const to = body.folder_id ? getFolder(body.folder_id).id : null
    checkFileNames(docs, to)
    sets.push('folder_id = ?')
    args.push(to)
    detail.folder = { to: folderPath(to), from: [...new Set(docs.map(d => folderPath(d.folder_id)))] }
  }
  if (body.kind !== undefined) {
    if (!DOCUMENT_KINDS.includes(body.kind as typeof DOCUMENT_KINDS[number]))
      throw createError({ statusCode: 400, statusMessage: 'BAD_KIND', message: `kind must be one of ${DOCUMENT_KINDS.join(', ')}.` })
    sets.push('kind = ?')
    args.push(body.kind)
    detail.kind = { to: body.kind, from: [...new Set(docs.map(d => d.kind))] }
  }
  if (body.title !== undefined) {
    if (docs.length !== 1) throw createError({ statusCode: 400, statusMessage: 'ONE_DOCUMENT', message: 'Rename one document at a time.' })
    const title = cleanName(body.title, 'title', 120)
    sets.push('title = ?')
    args.push(title)
    detail.title = { from: docs[0]!.title, to: title }
  }
  const add = (body.add_tags ?? []).map(id => getTag(id))
  const remove = (body.remove_tags ?? []).map(id => getTag(id))
  if (add.length) detail.tags_added = add.map(t => t.name)
  if (remove.length) detail.tags_removed = remove.map(t => t.name)
  if (!sets.length && !add.length && !remove.length)
    throw createError({ statusCode: 400, statusMessage: 'NOTHING_TO_DO', message: 'Choose a folder, tag, kind or title.' })

  tx(() => {
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
