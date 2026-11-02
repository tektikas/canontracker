import { readFileSync } from 'node:fs'

// The .docx a Word document version was imported from, exactly as uploaded. Behind the project guard like every content route.
export default defineEventHandler((event) => {
  const doc = useDb().prepare('select name, sha256 from documents where id = ? and project_id = ?').get(getRouterParam(event, 'id')!, pid()) as { name: string, sha256: string } | undefined
  let data: Buffer | undefined
  try { data = doc && readFileSync(originalPath(pid(), doc.sha256)) } catch {}
  if (!doc || !data) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'No original file for this document.' })
  setResponseHeaders(event, { 'content-type': DOCX_MIME, 'content-disposition': attachment(doc.name), 'x-content-type-options': 'nosniff' })
  return data
})
