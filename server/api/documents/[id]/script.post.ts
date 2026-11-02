// Link a recording to the script it was read from (any version id of the script; null unlinks). Editorial: the transcript
// and the script stay as they are. Applies to every version of the recording.
export default defineEventHandler(async (event) => {
  const db = useDb()
  const doc = db.prepare('select filename, name from documents where id = ? and project_id = ?').get(getRouterParam(event, 'id')!, pid()) as { filename: string, name: string } | undefined
  if (!doc || !getRecording(latestDocument(doc.filename)!.id)) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'This document is not a recording.' })
  requireRole('editor')
  const body = await readObject(event)
  const key = scriptKeyOf(body.script_document_id)
  tx(() => {
    db.prepare('update recordings set script_key = ? where project_id = ? and document_id in (select id from documents where project_id = ? and filename = ?)').run(key, pid(), pid(), doc.filename)
    audit('recording.script_linked', 'document', latestDocument(doc.filename)!.id, { filename: doc.name, script: key ? latestDocument(key)!.name : null })
  })
  return { script_key: key }
})
