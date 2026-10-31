// Upload the team's own images (concept art, character sheets, key art) into an entity's or document's image history.
// multipart: target_type, target_id, files (1–IMAGE_BATCH_FILES), optional caption, optional apply=1 (the first added
// file becomes the portrait or cover: an upload onto the portrait or cover slot). Each file gets its own result.
export default defineEventHandler(async (event) => {
  // Refuse an oversized body before reading it into memory.
  if (Number(getHeader(event, 'content-length') ?? 0) > IMAGE_BATCH_FILES * IMAGE_MAX_BYTES + 1_000_000)
    throw createError({ statusCode: 413, statusMessage: 'TOO_LARGE', message: `Upload at most ${IMAGE_BATCH_FILES} images of up to ${IMAGE_MAX_BYTES / 1e6} MB at a time.` })
  const form = await readMultipartFormData(event) ?? []
  const field = (n: string) => form.find(p => !p.filename && p.name === n)?.data.toString('utf8')
  const target = imageTarget(field('target_type'), field('target_id'))
  const files = form.filter(p => p.name === 'files' && p.filename !== undefined)
  if (!files.length) throw createError({ statusCode: 400, statusMessage: 'NO_FILES', message: 'Choose at least one image.' })
  if (files.length > IMAGE_BATCH_FILES) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: `Upload at most ${IMAGE_BATCH_FILES} images at a time.` })
  const caption = cleanText(field('caption') ?? '', 'Caption', IMAGE_CAPTION_MAX)
  return addUploads(target, files.map(f => ({ name: f.filename!, data: f.data })), { caption, apply: field('apply') === '1' })
})
