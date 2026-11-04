import { splitManuscript } from '../../../shared/utils/manuscript'
const MAX_BYTES = 1_000_000
const MAX_FILES = 20 // per request; the Library sends one file per request, scripts may batch

export default defineEventHandler(async (event) => {
  const form = await readLimitedForm(event, {
    maxTotal: MAX_FILES * (MAX_BYTES + 64_000) + 64_000,
    maxPart: MAX_BYTES + 64_000, // a file just over 1 MB still reaches the per-file "Too big" result
    maxParts: MAX_FILES + 8,
    maxField: 200, // folder id
    tooLarge: `Import at most ${MAX_FILES} files of up to 1 MB at a time.`,
    notMultipart: 'Send the files as a multipart form upload.'
  })
  const parts = form.filter(p => p.filename)
  if (parts.length > MAX_FILES) throw createError({ statusCode: 413, statusMessage: 'TOO_LARGE', message: `Import at most ${MAX_FILES} files of up to 1 MB at a time.` })
  // Optional: the Library folder new documents land in (a new version stays where its document is).
  const folderField = form.find(p => !p.filename && p.name === 'folder_id')?.data.toString('utf8') || null
  const folderId = folderField ? getFolder(folderField).id : null
  // background=1 (the web uploader): store each version and answer at once; extraction runs after (server/utils/extractions.ts).
  const background = form.find(p => !p.filename && p.name === 'background')?.data.toString('utf8') === '1'
  // A whole book in one file is split into one document per chapter (shared/utils/manuscript.ts, importManuscript) unless
  // keep_whole=1 ("Keep as one document" in the uploader; MCP sb_document import sends it unless asked to split).
  const keepWhole = form.find(p => !p.filename && p.name === 'keep_whole')?.data.toString('utf8') === '1'
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
      results.push({ filename, status: 'error', error: 'Too big: the limit is 1 MB per file.' })
      continue
    }
    try {
      // Word: converted to text here; the text is the source (hash, passages, quotes), the .docx is kept beside it.
      const docx = /\.docx$/i.test(filename)
      if (docx && p.type && ![DOCX_MIME, 'application/octet-stream', 'application/zip'].includes(p.type)) throw createError({ statusCode: 415, statusMessage: 'UNSUPPORTED_FILE', message: 'This is not a Word document (.docx).' })
      const { text, comments } = docx ? docxToText(p.data) : { text: p.data.toString('utf8'), comments: [] }
      const book = keepWhole ? null : splitManuscript(text, filename)
      if (book?.parts.length) results.push(await importManuscript(filename, book, folderId, comments))
      else results.push(await importDocument(filename, text, undefined, folderId, undefined, docx ? { original: p.data, comments } : undefined, undefined, background))
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      results.push({ filename, status: 'error', error: (e as Error).message, ...(code && { code }) })
    }
  }
  return { results }
})
