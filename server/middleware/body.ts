// JSON bodies are read whole into memory, capped at 4 MB while they stream in (the largest real one is a 1 MB draft).
// Uploads (multipart) have their own limits in server/utils/form.ts; /mcp has a lower one.
const MAX_JSON = 4_000_000

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/') || /^\s*multipart\//i.test(getRequestHeader(event, 'content-type') ?? '')) return
  await readLimitedBody(event, MAX_JSON)
})
