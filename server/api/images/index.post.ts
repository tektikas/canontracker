// Generate 1–4 images with Muse Image. They are stored with their exact prompt and audited, and applied to nothing:
// the writer picks one (or none) afterwards.
export default defineEventHandler(async (event) => {
  const body = await readObject<{ target_type?: string, target_id?: string, prompt?: unknown, style?: string, n?: number }>(event)
  const target = imageTarget(body.target_type, body.target_id)
  const model = imageModelInfo()
  if (!model.live)
    throw createError({ statusCode: 409, statusMessage: 'IMAGE_MODEL_OFFLINE', message: 'Image generation needs the live Meta Model API. This workspace runs on recorded demo output, which has no image model.' })
  const prompt = cleanText(body.prompt ?? '', 'Prompt', 2000)
  if (!prompt) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'Describe what to draw.' })
  const style = (body.style ?? 'none') as ImageStyle
  if (typeof style !== 'string' || !Object.hasOwn(IMAGE_STYLES, style)) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'Unknown style preset.' })
  const n = Number(body.n ?? 1)
  if (!Number.isInteger(n) || n < 1 || n > 4) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'Make 1 to 4 images at a time.' })

  const sent = composeImagePrompt(prompt, style, access().project.art_style)
  const { images: results } = await generateImages(sent, n, target)
  // Generation takes a while: the page may have been deleted, merged away or reset meanwhile. Check again; from here to the
  // end nothing awaits, so no other request can change the target before the rows are in.
  try {
    imageTarget(target.type, target.id)
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'TARGET_GONE', message: `“${target.name}” was deleted, merged or reset while the image was being made. Nothing was saved.` })
  }
  const at = now()
  const ids = results.map(() => newId('img'))
  try {
    results.forEach((r, i) => savePortrait(ids[i]!, r.bytes))
    tx(() => {
      const insert = useDb().prepare(`insert into images (id, target_type, target_id, prompt, style, model_id, mime, bytes, created_at, created_by, applied_at, project_id)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?)`)
      results.forEach((r, i) => insert.run(ids[i]!, target.type, target.id, sent, style, model.id, r.type, r.bytes.length, at, access().user.id, pid()))
      audit('image.generated', target.type, target.id, { name: target.name, images: ids, model: model.id, style, prompt: sent })
    })
  } catch (e) {
    ids.forEach(removePortrait)
    throw e
  }
  return listImages(target.type, target.id).filter(i => ids.includes(i.id))
})
