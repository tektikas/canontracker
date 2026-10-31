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
  // Optional: the Library folder new documents land in (a new version stays where its document is).
  const folderField = form.find(p => !p.filename && p.name === 'folder_id')?.data.toString('utf8') || null
  const folderId = folderField ? getFolder(folderField).id : null
  if (!parts.length) throw createError({ statusCode: 400, statusMessage: 'NO_FILES', message: 'Attach at least one file.' })
  const results = []
  // One bad file never undoes the others.
  for (const p of parts) {
    const filename = p.filename!
    if (!/\.(md|markdown|txt)$/i.test(filename)) {
      results.push({ filename, status: 'error', error: 'Not a text file: use .md or .txt.' })
      continue
    }
    if (p.data.length > MAX_BYTES) {
      results.push({ filename, status: 'error', error: 'Too big: the limit is 1 MB per file.' })
      continue
    }
    try {
      results.push(await importDocument(filename, p.data.toString('utf8'), undefined, folderId))
    } catch (e) {
      results.push({ filename, status: 'error', error: (e as Error).message })
    }
  }
  return { results }
})
