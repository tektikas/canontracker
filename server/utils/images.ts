import type { DocumentRow } from './db'

export interface ImageRow {
  id: string, target_type: ImageTarget, target_id: string, prompt: string, style: string, model_id: string, mime: string, bytes: number
  created_at: string, created_by: string, applied_at: string | null, project_id: string
}

// Generated image bytes share the portrait folder (.data/portraits/<project>/<image id>): one store, one cleanup on reset.
export const imageUrl = (i: { id: string }) => `/api/images/${i.id}`

export function getImage(id: string) {
  const i = useDb().prepare('select * from images where id = ? and project_id = ?').get(id, pid()) as unknown as ImageRow | undefined
  if (!i) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Image not found.' })
  return i
}

export function listImages(type: ImageTarget, id: string) {
  return (useDb().prepare(`select i.*, u.name created_by_name from images i left join users u on u.id = i.created_by
    where i.project_id = ? and i.target_type = ? and i.target_id = ? order by i.created_at desc, i.rowid desc`)
    .all(pid(), type, id) as unknown as (ImageRow & { created_by_name: string | null })[])
    .map(({ project_id: _, ...i }) => ({ ...i, url: imageUrl(i), applied: !!i.applied_at }))
}

// The image currently used as this target's portrait or cover, with what it needs for its "Generated with" label.
export const appliedImage = (type: ImageTarget, id: string) => listImages(type, id).find(i => i.applied) ?? null

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
      `${e.kind === 'location' ? 'A view of' : e.kind === 'character' ? 'A portrait of' : 'An illustration of'} ${e.name}${e.kind === 'other' ? '' : `, a ${kind} in the story`}.`,
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
