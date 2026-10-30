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

// The name analysis knows a page by: the one accepted canon uses most for it (a renamed page keeps its old name in canon),
// the page name when canon doesn't name it yet.
export function analysisName(e: EntityRow) {
  const uses = new Map(namesOf(e).map(n => [normName(n), { name: n, n: 0 }]))
  for (const f of factsAbout(e)) for (const n of [f.subject, f.object]) { const u = n && uses.get(normName(n)); if (u) u.n++ }
  const top = [...uses.values()].sort((a, b) => b.n - a.n)[0]!
  return top.n > uses.get(normName(e.name))!.n ? top.name : e.name
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
    if (!Object.hasOwn(FIELD_LABEL, k)) throw fail(400, 'INVALID', `Unknown field ${k}.`)
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

// Merging `src` into `dst`: canon and pending facts naming src are re-pointed at dst's analysis name; src's names become dst aliases;
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
    target: { id: dst.id, name: dst.name, kind: dst.kind }, canonical: analysisName(dst),
    facts, aliases_added: added, fields_filled: filled, summary_taken: !dst.summary && !!src.summary, notes_added: !!carried, portrait,
    apply: { aliases, fields, summary, notes, srcNames },
  }
}

// What a merge decides beyond the page itself, measured by running the real rules before and after the re-point:
// open rule-based conflicts whose premise the merge removed close as "resolved by merge"; pending change proposals whose
// impact the merge changed are marked stale; the merged names are remembered so later candidates follow the same identity.
// Writes everything in the caller's transaction (the preview runs it in dryRun and rolls back).
export function mergeEntities(src: EntityRow, dst: EntityRow, plan: ReturnType<typeof planMerge>) {
  const d = useDb()
  const by = access().user.id
  const at = now()
  const canon = () => d.prepare(`select * from facts where project_id = ? and status = 'canon'`).all(pid()) as unknown as Fact[]
  const openConflicts = d.prepare(`select * from conflicts where project_id = ? and status = 'open' and origin = 'rule'`).all(pid()) as unknown as ConflictRow[]
  const pending = d.prepare(`select * from changes where project_id = ? and status = 'ready_for_review'`).all(pid()) as unknown as ChangeRow[]
  const holds = (c: ConflictRow, travel: Fact[]) => ruleHits(getFact(c.left_fact_id), getFact(c.right_fact_id), travel).some(h => h.rule === c.rule)
  const impactKey = (c: ChangeRow) => analyzeImpact(c.target_fact_id).map(i => `${i.target_id}:${i.hop_count}`).sort().join(' ')

  const travelBefore = canon().filter(isTravel)
  const heldBefore = new Set(openConflicts.filter(c => holds(c, travelBefore)).map(c => c.id))
  const impactBefore = new Map(pending.map(c => [c.id, impactKey(c)]))

  const { apply } = plan
  const repoint = (n: string | null) => (n && apply.srcNames.has(normName(n)) ? plan.canonical : n)
  const upd = d.prepare('update facts set subject = ?, object = ? where id = ?')
  for (const f of plan.facts) upd.run(repoint(f.subject), repoint(f.object), f.id)
  d.prepare(`update entities set aliases = ?, fields = ?, summary = ?, notes = ?, updated_at = ?, updated_by = ? where id = ?`)
    .run(JSON.stringify(apply.aliases), JSON.stringify(apply.fields), apply.summary, apply.notes, at, by, dst.id)
  if (plan.portrait === 'move') d.prepare('update entities set portrait_type = ?, portrait_at = ? where id = ?').run(src.portrait_type, at, dst.id)
  d.prepare('delete from entities where id = ?').run(src.id)

  const travelAfter = canon().filter(isTravel)
  const resolved = openConflicts.filter(c => heldBefore.has(c.id) && !holds(c, travelAfter))
  const stale = pending.filter(c => impactKey(c) !== impactBefore.get(c.id))
  // The page's name plus every name canon actually used for it; hand-typed aliases nobody cited stay editorial.
  const mapped = new Map([[normName(src.name), src.name]])
  for (const f of plan.facts) for (const n of [f.subject, f.object]) if (n && apply.srcNames.has(normName(n))) mapped.set(normName(n), n.trim())

  // The before-values of every re-pointed fact and the full source page, so the merge can be traced and undone by hand.
  const auditId = audit('entity.merged', 'entity', dst.id, {
    from: snapshot(src), into: dst.name, canonical: plan.canonical, aliases_added: plan.aliases_added, fields_filled: plan.fields_filled, portrait: plan.portrait,
    facts: plan.facts.map(f => ({ id: f.id, subject: f.subject, object: f.object })),
    names_mapped: [...mapped.values()], conflicts_resolved: resolved.map(c => c.id), changes_stale: stale.map(c => c.id),
  })

  const why = `${src.name} was merged into ${dst.name}, so this is no longer a conflict.`
  for (const c of resolved) {
    d.prepare(`update conflicts set status = 'resolved_by_merge', decided_at = ?, decision_rationale = ?, decided_by = ?, merge_audit_id = ? where id = ?`)
      .run(at, why, by, auditId, c.id)
    audit('conflict.resolved_by_merge', 'conflict', c.id, { rule: c.rule, from: src.name, into: dst.name, merge_audit_id: auditId })
  }
  const staleNote = JSON.stringify({ audit_id: auditId, from: src.name, into: dst.name, at })
  for (const c of stale) {
    d.prepare('update changes set impact_stale = ? where id = ?').run(staleNote, c.id)
    audit('impact.stale', 'change', c.id, { from: src.name, into: dst.name, merge_audit_id: auditId })
  }
  const remember = d.prepare(`insert into entity_merges (name_norm, name, canonical, entity_id, audit_id, merged_at, merged_by, project_id) values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict (project_id, name_norm) do update set name = excluded.name, canonical = excluded.canonical, entity_id = excluded.entity_id,
    audit_id = excluded.audit_id, merged_at = excluded.merged_at, merged_by = excluded.merged_by`)
  for (const [norm, name] of mapped) remember.run(norm, name, plan.canonical, dst.id, auditId, at, by, pid())
  // Names merged into src earlier (their facts were just re-pointed along with src's) now map to dst's canonical name.
  const earlier = d.prepare('select name_norm, canonical, entity_id from entity_merges where project_id = ?').all(pid()) as { name_norm: string, canonical: string, entity_id: string }[]
  const follow = d.prepare('update entity_merges set canonical = ?, entity_id = ?, audit_id = ?, merged_at = ?, merged_by = ? where project_id = ? and name_norm = ?')
  for (const m of earlier) if (!mapped.has(m.name_norm) && (m.entity_id === src.id || apply.srcNames.has(normName(m.canonical))))
    follow.run(plan.canonical, dst.id, auditId, at, by, pid(), m.name_norm)

  return {
    audit_id: auditId, names_mapped: [...mapped.values()],
    conflicts_resolved: resolved.map(c => ({ id: c.id, rule: c.rule, rationale: c.rationale })),
    changes_stale: stale.map(c => ({ id: c.id, proposed_statement: c.proposed_statement })),
  }
}

// The merge decision that maps `name` to another entity, if one was made. Only merges write these; hand-typed aliases never do.
// `to` is the canonical name fixed at merge time; entity_id is whichever page carries that name now (null if none does).
export function mergedIdentity(name: string | null) {
  if (!name) return null
  const m = useDb().prepare(`select m.canonical, m.audit_id, m.merged_at, u.name merged_by_name from entity_merges m
    left join users u on u.id = m.merged_by where m.project_id = ? and m.name_norm = ?`)
    .get(pid(), normName(name)) as { canonical: string, audit_id: string, merged_at: string, merged_by_name: string | null } | undefined
  if (!m || normName(m.canonical) === normName(name)) return null
  const page = listEntities().find(e => namesOf(e).some(n => normName(n) === normName(m.canonical)))
  return { from: name, to: m.canonical, entity_id: page?.id ?? null, merged_at: m.merged_at, merged_by_name: m.merged_by_name, audit_id: m.audit_id }
}
export const identityOf = (f: { subject: string, object: string | null }) => (['subject', 'object'] as const)
  .flatMap((role) => { const m = mergedIdentity(f[role]); return m ? [{ role, ...m }] : [] })

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
