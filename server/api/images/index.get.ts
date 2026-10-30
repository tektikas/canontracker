// Everything the generate dialog needs for one entity or document: model status, the project art style, a prompt
// drafted from accepted canon + editorial fields, and the images made for it so far (newest first).
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const target = imageTarget(q.target_type, q.target_id)
  return { model: imageModelInfo(), art_style: access().project.art_style, target, images: listImages(target.type, target.id) }
})
