// Upload one image and use it as the portrait right away. It lands in the entity's image history like any other upload,
// so replacing or removing the portrait later never loses it. (The page uses /api/images/upload with apply=1.)
export default defineEventHandler(async (event) => {
  const e = getEntity(getRouterParam(event, 'id')!)
  const file = (await readImageForm(event, 1)).find(p => p.name === 'file' && p.filename)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'NO_FILE', message: 'Choose an image to upload.' })
  const { results } = addUploads(imageTarget('entity', e.id), [{ name: file.filename!, data: file.data }], { apply: true })
  const r = results[0]!
  if (r.status === 'refused') throw createError({ statusCode: file.data.length > IMAGE_MAX_BYTES ? 413 : 415, statusMessage: 'UNSUPPORTED', message: r.message })
  return { portrait: portraitUrl(getEntity(e.id)) }
})
