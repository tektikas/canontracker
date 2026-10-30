const MAX_BYTES = 1_000_000

export default defineEventHandler(async (event) => {
  const parts = (await readMultipartFormData(event))?.filter(p => p.filename) ?? []
  if (!parts.length) throw createError({ statusCode: 400, statusMessage: 'NO_FILES', message: 'Attach at least one file.' })
  const results = []
  // One bad file never undoes the others.
  for (const p of parts) {
    const filename = p.filename!
    if (!/\.(md|markdown|txt)$/i.test(filename)) {
      results.push({ filename, status: 'error', error: 'Unsupported format (use .md or .txt).' })
      continue
    }
    if (p.data.length > MAX_BYTES) {
      results.push({ filename, status: 'error', error: 'File too large (max 1 MB).' })
      continue
    }
    try {
      results.push(await importDocument(filename, p.data.toString('utf8')))
    } catch (e) {
      results.push({ filename, status: 'error', error: (e as Error).message })
    }
  }
  return { results }
})
