// "Save to story": the draft becomes a read-only document version (hash, passages, stale citations) and the draft goes away.
// A new document gets a filename from its title; an edit adds a version to the document it came from.
export default defineEventHandler(async (event) => {
  const d = getDraft(getRouterParam(event, 'id')!)
  const db = useDb()
  const title = d.title.trim()
  if (!title) throw createError({ statusCode: 400, statusMessage: 'TITLE_REQUIRED', message: 'Give the document a title.' })
  if (!d.content.trim()) throw createError({ statusCode: 400, statusMessage: 'EMPTY_DOCUMENT', message: 'Write something before saving.' })

  let filename = d.filename
  if (!filename) {
    // No extension, so a written document never shares a name (and a version line) with an uploaded .md/.txt file.
    const slug = title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document'
    const taken = new Set((db.prepare('select filename n from documents where project_id = ? union select name from documents where project_id = ?').all(pid(), pid()) as { n: string }[]).map(r => r.n))
    filename = slug
    for (let n = 2; taken.has(filename); n++) filename = `${slug}-${n}`
  }

  const latest = latestDocument(filename)
  // An edit saves on top of the latest version, so it must have started from it, or the writer must say it's fine.
  if (d.filename && latest && d.base_document_id !== latest.id && (await readBody<{ overwrite?: boolean } | null>(event).catch(() => null))?.overwrite !== true) {
    const base = d.base_document_id ? db.prepare('select version from documents where id = ?').get(d.base_document_id) as { version: number } | undefined : undefined
    throw createError({ statusCode: 409, statusMessage: 'DRAFT_STALE', message: base ? `v${latest.version} was saved after you started editing v${base.version}.` : `v${latest.version} may have been saved after you started editing.`, data: { base_version: base?.version ?? null, latest_version: latest.version, latest_id: latest.id, base_id: base ? d.base_document_id : null } })
  }
  const result = await importDocument(filename, d.content, { title, kind: d.kind })
  if (result.status === 'duplicate') {
    // Saving unchanged text is not an error: the story already has it.
    if (latest && result.document_id === latest.id) {
      if (latest.title !== title || latest.kind !== d.kind)
        throw createError({ statusCode: 409, statusMessage: 'TEXT_UNCHANGED', message: `The text is the same as v${latest.version}. A new version needs a change in the text.` })
      db.prepare('delete from drafts where id = ?').run(d.id)
      return { ...result, status: 'unchanged' as const, version: latest.version }
    }
    const same = db.prepare('select title, version from documents where id = ?').get(result.document_id) as { title: string, version: number }
    throw createError({ statusCode: 409, statusMessage: 'DUPLICATE_TEXT', message: `This text is word for word the same as “${same.title}” v${same.version}. Change something before saving.` })
  }
  db.prepare('delete from drafts where id = ?').run(d.id)
  return result
})
