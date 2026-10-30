const MAX_BYTES = 2_000_000

export default defineEventHandler(async (event) => {
  const e = getEntity(getRouterParam(event, 'id')!)
  const file = (await readMultipartFormData(event))?.find(p => p.name === 'file' && p.filename)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'NO_FILE', message: 'Choose an image to upload.' })
  if (file.data.length > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'TOO_LARGE', message: 'Images can be up to 2 MB.' })
  const type = imageType(file.data)
  if (!type) throw createError({ statusCode: 415, statusMessage: 'UNSUPPORTED', message: 'Use a PNG, JPEG, WebP or GIF image.' })
  savePortrait(e.id, file.data)
  const at = now()
  tx(() => {
    useDb().prepare('update entities set portrait_type = ?, portrait_at = ?, updated_at = ?, updated_by = ? where id = ?').run(type, at, at, access().user.id, e.id)
    audit('entity.portrait_set', 'entity', e.id, { name: e.name, type, bytes: file.data.length, replaced: !!e.portrait_type })
  })
  return { portrait: portraitUrl({ ...e, portrait_type: type, portrait_at: at }) }
})
