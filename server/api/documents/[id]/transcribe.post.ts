import { existsSync, readFileSync } from 'node:fs'

// Transcribe a recording's audio again. The new transcript is a new version of the document (or "duplicate" when it reads
// the same), never an edit of the old one; old citations go through the usual re-check.
export default defineEventHandler(async (event) => {
  const doc = useDb().prepare('select filename from documents where id = ? and project_id = ?').get(getRouterParam(event, 'id')!, pid()) as { filename: string } | undefined
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Document not found.' })
  requireRole('editor')
  spendAudio('recording', 0)
  const latest = latestDocument(doc.filename)!
  const rec = getRecording(latest.id)
  if (!rec || !existsSync(audioPath(rec.audio_sha256))) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'This document is not a recording.' })
  const wav = await toMuseWav(readFileSync(audioPath(rec.audio_sha256)), 'audio.wav')
  return importRecording(latest.name, wav, { folderId: latest.folder_id, scriptKey: rec.script_key, target: { type: 'document', id: latest.id } })
})
