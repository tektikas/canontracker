// Run extraction again on the latest version of a document. Only adds pending candidates (a person still decides each one);
// anything already in the project, whatever its status, is skipped. Editors and up (viewers are refused by the guard).
export default defineEventHandler(async (event) => {
  const db = useDb()
  const doc = db.prepare('select filename from documents where id = ? and project_id = ?').get(getRouterParam(event, 'id')!, pid()) as { filename: string } | undefined
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Document not found.' })
  requireRole('editor')
  const latest = latestDocument(doc.filename)!
  // { background: true } ("Try again" after a background run failed): queued like an upload's extraction; answers at once.
  if ((await readObject(event)).background === true)
    return { document_id: latest.id, version: latest.version, extraction: queueExtraction({ ...latest, folder: folderPath(latest.folder_id) }, true) }
  const model = modelInfo()
  // Recorded mode replays output recorded for the demo files' own text only; say so instead of pretending to read this one.
  const recordedCovers = model.mode === 'mock' ? await hasRecordedExtraction(latest.content) : null
  const passages = db.prepare('select id, text from passages where document_id = ? order by ordinal').all(latest.id) as { id: string, text: string }[]
  try {
    const r = await extractInto({ id: latest.id, filename: latest.filename, title: latest.title, content: latest.content }, passages)
    audit('document.reextracted', 'document', latest.id, {
      filename: latest.name, folder: folderPath(latest.folder_id), title: latest.title, version: latest.version, model_id: model.id,
      proposed: r.proposed, created: r.created, unverified: r.unverified, skipped: r.skipped_by_status,
    })
    return { document_id: latest.id, version: latest.version, mode: model.mode, model_label: model.label, recorded_covers: recordedCovers, ...r, model: undefined }
  } catch (e) {
    audit('job.failed', 'document', latest.id, { step: 're-extraction', filename: latest.name, error: (e as Error).message })
    throw createError({ statusCode: 502, statusMessage: 'EXTRACTION_FAILED', message: `Extraction failed: ${(e as Error).message} Nothing was added.` })
  }
})
