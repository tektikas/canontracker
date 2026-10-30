import { mkdirSync, readFileSync, rmSync, renameSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface EntityRow {
  id: string, name: string, kind: EntityKind, summary: string, aliases: string, fields: string, notes: string
  portrait_type: string | null, portrait_at: string | null, origin: string, created_at: string, created_by: string | null
  updated_at: string, updated_by: string | null, project_id: string
}

const fail = (statusCode: number, statusMessage: string, message: string) => createError({ statusCode, statusMessage, message })

export const aliasesOf = (e: EntityRow) => JSON.parse(e.aliases) as string[]
export const fieldsOf = (e: EntityRow) => JSON.parse(e.fields) as Record<string, string>
export const namesOf = (e: EntityRow) => [e.name, ...aliasesOf(e)]
export const portraitUrl = (e: EntityRow) => (e.portrait_type ? `/api/entities/${e.id}/portrait?v=${encodeURIComponent(e.portrait_at ?? '')}` : null)

export const portraitDir = () => join('.data', 'portraits', pid())
export const portraitPath = (id: string) => join(portraitDir(), id)

export function listEntities() {
  return useDb().prepare('select * from entities where project_id = ? order by name collate nocase').all(pid()) as unknown as EntityRow[]
}

export function getEntity(id: string) {
  const e = useDb().prepare('select * from entities where id = ? and project_id = ?').get(id, pid()) as unknown as EntityRow | undefined
  if (!e) throw fail(404, 'NOT_FOUND', 'Entity not found.')
  return e
}

// The kind a name most likely has, judged from how accepted canon uses it. A guess people can change on the page.
function kindVotes(f: { kind: string, predicate: string }, role: 'subject' | 'object'): EntityKind | null {
  if (f.predicate === 'travel_time') return 'location'
  if (role === 'object' && /^(located_at|kept_in|lives_in|born_in)$/.test(f.predicate)) return 'location'
  if (role === 'subject' && f.predicate === 'kept_in') return 'item'
  if (role === 'object' && /(carr|handl|uses|hold|wield|bear)/.test(f.predicate)) return 'item'
  if (f.kind === 'relationship' || (role === 'subject' && (f.kind === 'character' || f.kind === 'event'))) return 'character'
  return null
}

// Files a wiki page for every name in accepted canon that no page (by name or alias) covers yet. Idempotent.
export function syncEntities() {
  const d = useDb()
  const known = new Set(listEntities().flatMap(namesOf).map(normName))
  const facts = d.prepare(`select kind, subject, predicate, object from facts where project_id = ? and status = 'canon' order by rowid`).all(pid()) as { kind: string, subject: string, predicate: string, object: string | null }[]
  const found = new Map<string, { name: string, votes: Map<EntityKind, number> }>()
  for (const f of facts) {
    for (const role of ['subject', 'object'] as const) {
      const name = f[role]?.trim()
      if (!name || known.has(normName(name))) continue
      const g = found.get(normName(name)) ?? found.set(normName(name), { name, votes: new Map() }).get(normName(name))!
      const k = kindVotes(f, role)
      if (k) g.votes.set(k, (g.votes.get(k) ?? 0) + 1)
    }
  }
  if (!found.size) return
  const insert = d.prepare(`insert into entities (id, name, kind, origin, created_at, updated_at, project_id) values (?, ?, ?, 'canon', ?, ?, ?)`)
  tx(() => {
    for (const { name, votes } of found.values()) {
      const kind = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other'
      insert.run(newId('ent'), name, kind, now(), now(), pid())
    }
  })
}

// Canon (and optionally pending) facts that name this entity as subject or object, by name or alias.
export function factsAbout(e: EntityRow, statuses = ['canon']) {
  const names = new Set(namesOf(e).map(normName))
  return listFacts(`status in (${statuses.map(() => '?').join(', ')})`, ...statuses)
    .filter(f => names.has(normName(f.subject)) || names.has(normName(f.object)))
}

// Names and aliases must point at one page only, or mentions and fact links would be ambiguous.
export function assertNamesFree(names: string[], exceptId?: string) {
  const taken = new Map<string, string>()
  for (const e of listEntities()) if (e.id !== exceptId) for (const n of namesOf(e)) taken.set(normName(n), e.name)
  for (const n of names) {
    const owner = taken.get(normName(n))
    if (owner) throw fail(409, 'NAME_TAKEN', owner.toLowerCase() === n.toLowerCase() ? `There is already a page for ${owner}.` : `“${n}” is already a name or alias of ${owner}.`)
  }
}

export function cleanAliases(v: unknown, name: string) {
  if (!Array.isArray(v)) throw fail(400, 'INVALID', 'Aliases must be a list.')
  const out: string[] = []
  for (const a of v) {
    const s = cleanName(a, 'alias')
    if (normName(s) !== normName(name) && !out.some(x => normName(x) === normName(s))) out.push(s)
  }
  if (out.length > 20) throw fail(400, 'INVALID', 'Keep it to 20 aliases.')
  return out
}

export function cleanText(v: unknown, what: string, max: number) {
  if (typeof v !== 'string') throw fail(400, 'INVALID', `${what} must be text.`)
  const s = v.replace(/\r\n/g, '\n').trim()
  if (s.length > max) throw fail(400, 'INVALID', `Keep the ${what.toLowerCase()} under ${max.toLocaleString('en')} characters.`)
  return s
}

export function cleanFields(v: unknown, current: Record<string, string>) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw fail(400, 'INVALID', 'Fields must be an object.')
  const out = { ...current }
  for (const [k, val] of Object.entries(v)) {
    if (!(k in FIELD_LABEL)) throw fail(400, 'INVALID', `Unknown field ${k}.`)
    const s = cleanText(val ?? '', FIELD_LABEL[k]!.label, 500)
    if (s) out[k] = s
    else delete out[k]
  }
  return out
}

export function cleanKind(v: unknown): EntityKind {
  if (!ENTITY_KINDS.includes(v as EntityKind)) throw fail(400, 'INVALID', `Kind must be one of ${ENTITY_KINDS.join(', ')}.`)
  return v as EntityKind
}

// What a page looks like in the audit trail: enough to rebuild it by hand.
export const snapshot = (e: EntityRow) => ({
  id: e.id, name: e.name, kind: e.kind, summary: e.summary, aliases: aliasesOf(e), fields: fieldsOf(e), notes: e.notes, portrait: !!e.portrait_type,
})

// Merging `src` into `dst`: canon and pending facts naming src are re-pointed at dst's name; src's names become dst aliases;
// empty dst fields are filled from src; src's summary and notes are appended to dst's notes. Rejected and superseded facts
// keep their original wording as history (the new aliases still link them to dst).
export function planMerge(src: EntityRow, dst: EntityRow) {
  if (src.id === dst.id) throw fail(400, 'INVALID', 'Pick a different page to merge into.')
  const srcNames = new Set(namesOf(src).map(normName))
  const facts = (useDb().prepare(`select id, subject, object, statement, status from facts where project_id = ? and status in ('canon', 'pending') order by rowid`)
    .all(pid()) as { id: string, subject: string, object: string | null, statement: string, status: string }[])
    .filter(f => srcNames.has(normName(f.subject)) || srcNames.has(normName(f.object)))
  const aliases = [...aliasesOf(dst)]
  const added: string[] = []
  for (const n of namesOf(src)) {
    if (normName(n) === normName(dst.name) || aliases.some(a => normName(a) === normName(n))) continue
    aliases.push(n)
    added.push(n)
  }
  const dstFields = fieldsOf(dst)
  const srcFields = fieldsOf(src)
  const filled = Object.keys(srcFields).filter(k => !dstFields[k])
  const fields = { ...srcFields, ...dstFields }
  const summary = dst.summary || src.summary
  const carried = [dst.summary && src.summary ? src.summary : '', src.notes].filter(Boolean).join('\n\n')
  const notes = carried ? [dst.notes, `**From “${src.name}” (merged)**\n\n${carried}`].filter(Boolean).join('\n\n') : dst.notes
  const portrait = src.portrait_type ? (dst.portrait_type ? 'discard' : 'move') : 'none'
  return {
    source: { id: src.id, name: src.name, kind: src.kind },
    target: { id: dst.id, name: dst.name, kind: dst.kind },
    facts, aliases_added: added, fields_filled: filled, summary_taken: !dst.summary && !!src.summary, notes_added: !!carried, portrait,
    apply: { aliases, fields, summary, notes, srcNames },
  }
}

export function savePortrait(id: string, data: Buffer) {
  mkdirSync(portraitDir(), { recursive: true })
  writeFileSync(portraitPath(id), data)
}
export const readPortrait = (id: string) => (existsSync(portraitPath(id)) ? readFileSync(portraitPath(id)) : null)
export const removePortrait = (id: string) => rmSync(portraitPath(id), { force: true })
export const movePortrait = (from: string, to: string) => renameSync(portraitPath(from), portraitPath(to))

// Only raster formats, recognised by their magic bytes rather than the browser-supplied type. No SVG: it can carry script.
export function imageType(b: Buffer) {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png'
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg'
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (b.length > 6 && /^GIF8[79]a$/.test(b.toString('ascii', 0, 6))) return 'image/gif'
  return null
}
