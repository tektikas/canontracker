// Dictation and voice questions: a short clip from the browser's microphone (MediaRecorder: WebM/Ogg/MP4) becomes text the
// person reviews before using it. Nothing is stored but the model_calls row. Viewers may use it too (to ask by voice).
const MAX_BYTES = 16 * 1024 * 1024
const DICTATION_MAX_MS = 5 * 60_000

export default defineEventHandler(async (event) => {
  const form = await readLimitedForm(event, {
    maxTotal: MAX_BYTES + 16_000, maxPart: MAX_BYTES + 8_000, maxParts: 3, maxField: 100,
    tooLarge: 'Voice clips can be up to 16 MB.', notMultipart: 'Send the clip as a multipart form upload.',
  })
  const file = form.find(p => p.name === 'audio' && p.filename)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'NO_FILE', message: 'Attach the recorded clip.' })
  const wav = await toMuseWav(file.data, file.filename!)
  if (wav.duration_ms > DICTATION_MAX_MS) throw createError({ statusCode: 413, statusMessage: 'TOO_LONG', message: 'Voice clips can be up to 5 minutes. Add longer audio as a recording in the Library.' })
  const t = await transcribeAudio(wav, { type: 'dictation', id: newId('dct') })
  return { text: transcriptOf(t.turns).turns.map(x => x.text).join(' '), duration_ms: wav.duration_ms }
})
