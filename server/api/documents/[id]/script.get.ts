// Script vs recording for one transcript version: the aligned lines and the canon flags (server/utils/script-align.ts).
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const doc = useDb().prepare('select id, title, version, origin from documents where id = ? and project_id = ?').get(id, pid()) as { id: string, title: string, version: number, origin: string } | undefined
  const rec = doc && getRecording(doc.id)
  if (!doc || !rec) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'This document is not a recording.' })
  const comparison = rec.script_key ? scriptComparison(doc.id, rec.script_key) : null
  return { recording: { id: doc.id, title: doc.title, version: doc.version, duration_ms: rec.duration_ms }, ...(comparison ?? { script: null, rows: [] }) }
})
