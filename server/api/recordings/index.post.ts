// Add a recording (voice-actor take, table read, interview, voice note): the audio is converted to the WAV Muse Voice
// Transcribe takes, transcribed, and the transcript becomes a read-only document version with timed passages. Editors only
// (the project guard blocks viewers). Same result shape as /api/documents, so the Library's upload list shows it.
const MAX_BYTES = 64 * 1024 * 1024

export default defineEventHandler(async (event) => {
  requireRole('editor')
  spendAudio('recording', 0) // a used-up hourly limit refuses before the upload is read
  const form = await readLimitedForm(event, {
    maxTotal: MAX_BYTES + 64_000, maxPart: MAX_BYTES + 16_000, maxParts: 6, maxField: 200,
    tooLarge: 'Recordings can be up to 64 MB. Shorten the file or export it at a lower bitrate.',
    notMultipart: 'Send the recording as a multipart form upload.',
  })
  const file = form.find(p => p.name === 'file' && p.filename)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'NO_FILE', message: 'Attach one audio file.' })
  const field = (n: string) => form.find(p => !p.filename && p.name === n)?.data.toString('utf8') || null
  const folderField = field('folder_id')
  const folderId = folderField ? getFolder(folderField).id : null
  const scriptKey = scriptKeyOf(field('script_document_id'))
  const name = file.filename!.replace(/^.*[\\/]/, '').slice(0, 200)
  const wav = await toMuseWav(file.data, name)
  // background=1 (the web uploader): the transcript is stored when transcription returns; extraction runs after the response.
  return { results: [await importRecording(name, wav, { folderId, scriptKey, target: { type: 'recording', id: wav.sha256 }, background: field('background') === '1' })] }
})
