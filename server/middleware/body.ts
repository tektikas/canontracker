// JSON bodies are read whole into memory, capped at 10 MB while they stream in (the largest real one is a 4 MB draft, escaped).
// Uploads (multipart) have their own limits in server/utils/form.ts; /mcp has a lower one.
const MAX_JSON = 10_000_000

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/') || /^\s*multipart\//i.test(getRequestHeader(event, 'content-type') ?? '')) return
  await readLimitedBody(event, MAX_JSON)
})
