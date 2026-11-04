import { splitManuscript } from '../../../shared/utils/manuscript'
const MAX_BYTES = 4_000_000
const MAX_FILES = 20 // per request; the Library sends one file per request, scripts may batch

export default defineEventHandler(async (event) => {
  const form = await readLimitedForm(event, {
    maxTotal: MAX_FILES * (MAX_BYTES + 64_000) + 64_000,
    maxPart: MAX_BYTES + 64_000, // a file just over 4 MB still reaches the per-file "Too big" result
    maxParts: MAX_FILES + 8,
    maxField: 200, // folder id
    tooLarge: `Import at most ${MAX_FILES} files of up to 4 MB at a time.`,
    notMultipart: 'Send the files as a multipart form upload.'
  })
  const parts = form.filter(p => p.filename)
  if (parts.length > MAX_FILES) throw createError({ statusCode: 413, statusMessage: 'TOO_LARGE', message: `Import at most ${MAX_FILES} files of up to 4 MB at a time.` })
  const field = (name: string) => form.find(p => !p.filename && p.name === name)?.data.toString('utf8') || null
  // document_id ("Upload new version" on a document page): the one file is the next version of that document, whatever its
  // own name; it keeps the document's name and folder and is never split. Recordings are transcribed, not uploaded as text.
  const targetId = field('document_id')
  const target = targetId ? useDb().prepare('select name, folder_id, origin from documents where id = ? and project_id = ?').get(targetId, pid()) as { name: string, folder_id: string | null, origin: string } | undefined : null
  if (targetId && !target) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Document not found.' })
  if (target) {
    if (target.origin === 'recording') throw createError({ statusCode: 400, statusMessage: 'RECORDING', message: 'A recording’s transcript is not replaced by a file. Use Transcribe again.' })
    if (parts.length !== 1) throw createError({ statusCode: 400, statusMessage: 'ONE_FILE', message: 'Upload one file as the new version.' })
  }
  // Optional: the Library folder new documents land in (a new version stays where its document is).
  const folderField = field('folder_id')
  const folderId = target ? target.folder_id : folderField ? getFolder(folderField).id : null
  // background=1 (the web uploader): store each version and answer at once; extraction runs after (server/utils/extractions.ts).
  const background = field('background') === '1'
  // A whole book in one file is split into one document per chapter (shared/utils/manuscript.ts, importManuscript) unless
  // keep_whole=1 ("Keep as one document" in the uploader; MCP sb_document import sends it unless asked to split).
  // Only prose files split: a screenplay, dialogue or data file stays one document.
  const keepWhole = field('keep_whole') === '1' || !!target
  if (!parts.length) throw createError({ statusCode: 400, statusMessage: 'NO_FILES', message: 'Attach at least one file.' })
  const results = []
  // One bad file never undoes the others.
  for (const p of parts) {
    const filename = p.filename!
    const problem = uploadNameProblem(filename)
    if (problem) {
      results.push({ filename, status: 'error', error: problem, code: 415 })
      continue
    }
    if (p.data.length > MAX_BYTES) {
      results.push({ filename, status: 'error', error: 'Too big: the limit is 4 MB per file.' })
      continue
    }
    try {
      // Word: converted to text here; the text is the source (hash, passages, quotes), the .docx is kept beside it.
      const docx = /\.docx$/i.test(filename)
      if (docx && p.type && ![DOCX_MIME, 'application/octet-stream', 'application/zip'].includes(p.type)) throw createError({ statusCode: 415, statusMessage: 'UNSUPPORTED_FILE', message: 'This is not a Word document (.docx).' })
      const { text, comments } = docx ? docxToText(p.data) : { text: p.data.toString('utf8'), comments: [] }
      const book = keepWhole || !/\.(md|markdown|txt|docx)$/i.test(filename) ? null : splitManuscript(text, filename)
      if (book?.parts.length) results.push(await importManuscript(filename, book, folderId, comments))
      else {
        const r = await importDocument(target?.name ?? filename, text, undefined, folderId, undefined, docx ? { original: p.data, comments } : undefined, undefined, background)
        results.push(target ? { ...r, filename, as: target.name } : r)
      }
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      results.push({ filename, status: 'error', error: (e as Error).message, ...(code && { code }) })
    }
  }
  return { results }
})
