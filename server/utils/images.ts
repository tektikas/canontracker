import type { H3Event } from 'h3'
import type { DocumentRow } from './db'

export interface ImageRow {
  id: string, target_type: ImageTarget, target_id: string, prompt: string, style: string, model_id: string, mime: string, bytes: number
  created_at: string, created_by: string, applied_at: string | null, project_id: string, source: ImageSource, caption: string, filename: string | null
}

// Generated image bytes share the portrait folder (.data/portraits/<project>/<image id>): one store, one cleanup on reset.
export const imageUrl = (i: { id: string }) => `/api/images/${i.id}`

export function getImage(id: string) {
  const i = useDb().prepare('select * from images where id = ? and project_id = ?').get(id, pid()) as unknown as ImageRow | undefined
  if (!i) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Image not found.' })
  return i
}

// Newest first; images added together (one upload or one generation) keep the order they were given in.
export function listImages(type: ImageTarget, id: string) {
  return (useDb().prepare(`select i.*, u.name created_by_name from images i left join users u on u.id = i.created_by
    where i.project_id = ? and i.target_type = ? and i.target_id = ? order by i.created_at desc, i.rowid asc`)
    .all(pid(), type, id) as unknown as (ImageRow & { created_by_name: string | null })[])
    .map(({ project_id: _, ...i }) => ({ ...i, url: imageUrl(i), applied: !!i.applied_at }))
}

// The image currently used as this target's portrait or cover, with what it needs for its "Generated with" label.
export const appliedImage = (type: ImageTarget, id: string) => listImages(type, id).find(i => i.applied) ?? null

// A person picks this image as the entity's portrait or the document's cover. Editorial only; canon is untouched.
// The portrait keeps its own copy of the bytes, so the entity index, hover cards and merges read it as before.
export function applyImage(i: ImageRow, target: { name: string, noun: string }) {
  const data = readPortrait(i.id)
  if (!data) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Image file is missing.' })
  const at = now()
  const replaced = i.target_type === 'entity' ? !!getEntity(i.target_id).portrait_type : !!appliedImage('document', i.target_id)
  if (i.target_type === 'entity') savePortrait(i.target_id, data)
  tx(() => {
    if (i.target_type === 'entity')
      useDb().prepare('update entities set portrait_type = ?, portrait_at = ?, updated_at = ?, updated_by = ? where id = ?').run(i.mime, at, at, access().user.id, i.target_id)
    clearApplied(i.target_type, i.target_id)
    useDb().prepare('update images set applied_at = ? where id = ?').run(at, i.id)
    audit('image.applied', i.target_type, i.target_id, { name: target.name, image: i.id, as: target.noun, source: i.source, replaced })
  })
  return at
}

// What the pixel caps need, read from the file's own structure: the largest side drawn (canvas or any frame), the number
// of frames and the pixels decoded across all of them. null when the structure is cut short or can't be read (refused).
export interface ImageSize { w: number, h: number, frames: number, pixels: number }
const still = (w: number, h: number): ImageSize => ({ w, h, frames: 1, pixels: w * h })

export function imageSize(b: Buffer, type: string): ImageSize | null {
  try {
    if (type === 'image/png') {
      // Signature, then a complete IHDR chunk (length 13, type, width, height, 5 bytes, CRC).
      if (b.length < 33 || b.readUInt32BE(8) !== 13 || b.toString('ascii', 12, 16) !== 'IHDR') return null
      return still(b.readUInt32BE(16), b.readUInt32BE(20))
    }
    if (type === 'image/gif') return gifSize(b)
    if (type === 'image/webp') return webpSize(b)
    // JPEG: walk the segments to the first start-of-frame marker.
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) return null
      const m = b[i + 1]!
      if (m === 0xFF) { i++; continue }
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return still(b.readUInt16BE(i + 7), b.readUInt16BE(i + 5))
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD9)) { i += 2; continue }
      i += 2 + b.readUInt16BE(i + 2)
    }
  } catch {} // a read past the end (RangeError) means the file is cut short
  return null
}

// GIF: the logical screen, then every block up to the trailer. Each image descriptor is a frame with its own size, which
// browsers decode even when it is bigger than the screen, so every one counts. A block that runs past the end is refused.
function gifSize(b: Buffer): ImageSize | null {
  const colors = (packed: number) => (packed & 0x80 ? 3 << ((packed & 7) + 1) : 0)
  const end = () => { throw new RangeError('cut short') }
  const skipSubBlocks = () => {
    let n: number | undefined
    while ((n = b[i++])) i += n
    if (n === undefined) end()
  }
  let w = b.readUInt16LE(6), h = b.readUInt16LE(8), frames = 0, pixels = 0
  let i = 13 + colors(b[10] ?? end())
  for (;;) {
    const block = b[i++]
    if (block === 0x3B || (block === undefined && frames)) break // the trailer (browsers forgive a missing one after whole frames)
    if (block === 0x21) { i++; skipSubBlocks() } // extension: label, then data sub-blocks
    else if (block === 0x2C) {
      const fw = b.readUInt16LE(i + 4), fh = b.readUInt16LE(i + 6)
      i += 9 + colors(b[i + 8] ?? end()) + 1 // descriptor, local colour table, LZW code size
      skipSubBlocks()
      frames++; pixels += fw * fh; w = Math.max(w, fw); h = Math.max(h, fh)
    } else return null
  }
  return { w, h, frames, pixels }
}

// WebP: walk the RIFF chunks; every chunk must fit in the file. A still image is one VP8/VP8L bitstream; an animation is
// ANMF frames, each with its own size. VP8X carries the canvas, which counts as a side too.
function webpSize(b: Buffer): ImageSize | null {
  if (b.readUInt32LE(4) + 8 > b.length) return null
  let w = 0, h = 0, frames = 0, pixels = 0
  const frame = (fw: number, fh: number) => { frames++; pixels += fw * fh; w = Math.max(w, fw); h = Math.max(h, fh) }
  for (let i = 12; i + 8 <= b.length;) {
    const id = b.toString('ascii', i, i + 4), n = b.readUInt32LE(i + 4), p = i + 8
    if (p + n > b.length) return null
    if (id === 'VP8X') { w = Math.max(w, 1 + b.readUIntLE(p + 4, 3)); h = Math.max(h, 1 + b.readUIntLE(p + 7, 3)) }
    else if (id === 'ANMF') frame(1 + b.readUIntLE(p + 6, 3), 1 + b.readUIntLE(p + 9, 3))
    else if (id === 'VP8 ') {
      if (n < 10 || b[p + 3] !== 0x9D || b[p + 4] !== 0x01 || b[p + 5] !== 0x2A) return null
      frame(b.readUInt16LE(p + 6) & 0x3FFF, b.readUInt16LE(p + 8) & 0x3FFF)
    } else if (id === 'VP8L') {
      if (n < 5 || b[p] !== 0x2F) return null
      frame(1 + (((b[p + 2]! & 0x3F) << 8) | b[p + 1]!), 1 + (((b[p + 4]! & 0x0F) << 10) | (b[p + 3]! << 2) | ((b[p + 2]! & 0xC0) >> 6)))
    }
    i = p + n + (n & 1)
  }
  return frames ? { w, h, frames, pixels } : null
}

// Image uploads: the limits come from the image rules, the streaming reader is readLimitedForm.
const PART_OVERHEAD = 64_000
export function readImageForm(event: H3Event, maxFiles: number) {
  return readLimitedForm(event, {
    maxTotal: maxFiles * (IMAGE_MAX_BYTES + PART_OVERHEAD) + PART_OVERHEAD,
    maxPart: IMAGE_MAX_BYTES + PART_OVERHEAD,
    maxParts: maxFiles + 8, // files, a few fields, the closing marker
    maxField: 4_000, // text fields are ids, a flag and a caption
    tooLarge: `Upload at most ${maxFiles} image${maxFiles === 1 ? '' : 's'} of up to ${IMAGE_MAX_BYTES / 1e6} MB at a time.`,
    notMultipart: 'Send the images as a multipart form upload.'
  })
}

export type UploadResult = { name: string, status: 'added', image: ReturnType<typeof listImages>[number] } | { name: string, status: 'refused', message: string }

// Store uploaded files in the target's image history. Each file is judged on its own bytes (type, size, pixels); one bad
// file never stops the others. apply: the first file that is added becomes the portrait or cover.
export function addUploads(target: ReturnType<typeof imageTarget>, files: { name: string, data: Buffer }[], opts: { caption?: string, apply?: boolean } = {}) {
  const mb = IMAGE_MAX_BYTES / 1e6
  const checked = files.map(({ name, data }) => {
    const type = imageType(data)
    const size = type && imageSize(data, type)
    const problem = data.length > IMAGE_MAX_BYTES ? `Too large: images can be up to ${mb} MB.`
      : !type ? 'Not a PNG, JPEG, WebP or GIF image (judged by its contents, not its name).'
      : !size || !size.w || !size.h ? 'This image looks damaged: its size can’t be read.'
      : size.w > IMAGE_MAX_SIDE || size.h > IMAGE_MAX_SIDE || size.w * size.h > IMAGE_MAX_PIXELS
        ? `Too many pixels (${size.w} × ${size.h}): up to ${IMAGE_MAX_SIDE.toLocaleString('en')} px a side and ${IMAGE_MAX_PIXELS / 1e6} megapixels.`
      : size.frames > IMAGE_MAX_FRAMES || size.pixels > IMAGE_MAX_PIXELS
        ? `Too much animation (${size.frames.toLocaleString('en')} frames, ${Math.ceil(size.pixels / 1e6)} megapixels in all): up to ${IMAGE_MAX_FRAMES.toLocaleString('en')} frames and ${IMAGE_MAX_PIXELS / 1e6} megapixels in all.`
      : null
    return { name: name.replace(/[\/\0]/g, '_').slice(0, 200) || 'image', data, type: type!, problem, id: problem ? '' : newId('img') }
  })
  const ok = checked.filter(c => !c.problem)
  const at = now()
  try {
    ok.forEach(c => savePortrait(c.id, c.data))
    tx(() => {
      const insert = useDb().prepare(`insert into images (id, target_type, target_id, prompt, style, model_id, mime, bytes, created_at, created_by, applied_at, project_id, source, caption, filename)
        values (?, ?, ?, '', 'none', '', ?, ?, ?, ?, null, ?, 'upload', ?, ?)`)
      ok.forEach(c => insert.run(c.id, target.type, target.id, c.type, c.data.length, at, access().user.id, pid(), opts.caption ?? '', c.name))
      if (ok.length) audit('image.uploaded', target.type, target.id, { name: target.name, images: ok.map(c => c.id), files: ok.map(c => c.name), as: target.noun })
    })
  } catch (e) {
    ok.forEach(c => removePortrait(c.id))
    throw e
  }
  const applied = opts.apply && ok[0] ? (applyImage(getImage(ok[0].id), target), ok[0].id) : null
  const rows = new Map(listImages(target.type, target.id).map(i => [i.id, i]))
  const results: UploadResult[] = checked.map(c => (c.problem ? { name: c.name, status: 'refused', message: c.problem } : { name: c.name, status: 'added', image: rows.get(c.id)! }))
  return { results, applied }
}

export function clearApplied(type: ImageTarget, id: string) {
  useDb().prepare('update images set applied_at = null where project_id = ? and target_type = ? and target_id = ?').run(pid(), type, id)
}

const LOGISTICS = /\b(takes?|minutes?|hours?|days?|travel|journey|walk(?:ing)?)\b/i
const line = (s: string) => s.replace(/\s+/g, ' ').trim()

// What the dialog proposes: the target's name and kind, its editorial description and what accepted canon says about it.
// Only canon (never pending candidates) and the team's own fields; the writer edits it before anything is sent.
export function imageTarget(type: unknown, id: unknown) {
  if (!IMAGE_TARGETS.includes(type as ImageTarget)) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'Images can be made for an entity or a document.' })
  if (type === 'entity') {
    const e = getEntity(String(id))
    const fields = fieldsOf(e)
    // Only what can be drawn: no rules, travel times or timings, which are logistics and not looks.
    const facts = factsAbout(e).filter(f => ['character', 'location', 'item', 'claim'].includes(f.kind) && f.t_from == null && !LOGISTICS.test(f.statement)).slice(0, 6)
    const kind = KIND_LABEL[e.kind].one.toLowerCase()
    // Canon's name, names merged into the page and hand-typed aliases: editorial here, they only help the prompt.
    const aka = namesOf(e).filter(n => normName(n) !== normName(e.name))
    const lines = [
      `${e.kind === 'location' ? 'A view of' : e.kind === 'character' ? 'A portrait of' : 'An illustration of'} ${e.name}${e.kind === 'other' ? '' : `, ${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind} in the story`}.`,
      aka.length && `Also known as ${aka.join(', ')}.`,
      e.summary && line(e.summary),
      ...['look', 'casting', 'mood', 'item_type'].filter(k => fields[k]).map(k => `${FIELD_LABEL[k]!.label}: ${line(fields[k]!)}`),
      ...facts.map(f => line(f.statement)),
    ]
    return { type: 'entity' as const, noun: imageNoun('entity', e.kind), id: e.id, name: e.name, suggestion: lines.filter(Boolean).join('\n') }
  }
  const doc = useDb().prepare('select * from documents where id = ? and project_id = ?').get(String(id), pid()) as unknown as DocumentRow | undefined
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Document not found.' })
  // A cover shows the scene, not its fact list: the title, where it is set and who is in it.
  const facts = listFacts(`status = 'canon' and id in (select fact_id from evidence where document_id = ?)`, doc.id)
  const named = new Set(facts.flatMap(f => [f.subject, f.object]).filter(Boolean).map(n => normName(n!)))
  const present = (kind: string) => listEntities().filter(e => e.kind === kind && namesOf(e).some(n => named.has(normName(n)))).map(e => e.name)
  const places = present('location'), people = present('character')
  const lines = [`A cover illustration for the ${doc.kind} “${doc.title}”.`, places.length && `Setting: ${places.slice(0, 3).join(', ')}.`, people.length && `Characters: ${people.slice(0, 4).join(', ')}.`]
  return { type: 'document' as const, noun: 'cover', id: doc.id, name: doc.title, suggestion: lines.filter(Boolean).join('\n') }
}
