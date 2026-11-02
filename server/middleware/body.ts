// JSON bodies are read whole into memory: anything over 4 MB is refused before it is read (the largest real one is a 1 MB draft).
// Uploads (multipart) have their own limits in server/utils/form.ts; /mcp has a lower one.
const MAX_JSON = 4_000_000

export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/') || getRequestHeader(event, 'content-type')?.startsWith('multipart/')) return
  if (Number(getRequestHeader(event, 'content-length') ?? 0) > MAX_JSON)
    throw createError({ statusCode: 413, statusMessage: 'TOO_LARGE', message: 'The request is too large.' })
})
