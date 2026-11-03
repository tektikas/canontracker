import { mkdirSync, readFileSync, rmSync, renameSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface EntityRow {
  id: string, name: string, analysis_name: string | null, kind: string, summary: string, aliases: string, fields: string, notes: string
  portrait_type: string | null, portrait_at: string | null, origin: string, created_at: string, created_by: string | null
  updated_at: string, updated_by: string | null, project_id: string
}

const fail = (statusCode: number, statusMessage: string, message: string) => createError({ statusCode, statusMessage, message })

export const aliasesOf = (e: EntityRow) => JSON.parse(e.aliases) as string[]
export const fieldsOf = (e: EntityRow) => JSON.parse(e.fields) as Record<string, string>
// The name analysis knows a page by. Stored once and never recalculated; a hand-made page nothing has pinned yet uses its title.
export const analysisName = (e: EntityRow) => e.analysis_name ?? e.name
// Names merged into this page: a merge decision made them this entity's, so they link here like aliases but aren't edited as such.
export const mergedFrom = (e: EntityRow) => mergeRows()
  .filter(m => normName(m.canonical) === normName(analysisName(e)) && m.name_norm !== normName(analysisName(e))).map(m => m.name)
// Every name that links to the page: title, aliases, the analysis name (which a rename or alias edit may have dropped) and merged names.
export const namesOf = (e: EntityRow) => [...new Map([e.name, ...aliasesOf(e), analysisName(e), ...mergedFrom(e)].map(n => [normName(n), n])).values()]
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

// The type a name most likely has, judged from how accepted canon uses it. A guess people can change on the page; it only
// names built-in keys, and only those the project still has count.
function kindVotes(f: { kind: string, predicate: string }, role: 'subject' | 'object'): string | null {
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
  const found = new Map<string, { name: string, votes: Map<string, number> }>()
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
  const insert = d.prepare(`insert into entities (id, name, analysis_name, kind, origin, created_at, updated_at, project_id) values (?, ?, ?, ?, 'canon', ?, ?, ?)`)
  tx(() => {
    // The project's types are read under the write lock, so a guess never names a type another process just removed.
    const types = entityTypes()
    const keys = new Set(types.map(t => t.key))
    const fallback = keys.has('other') ? 'other' : types[0]!.key
    for (const { name, votes } of found.values()) {
      const kind = [...votes].filter(([k]) => keys.has(k)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback
      insert.run(newId('ent'), name, name, kind, now(), now(), pid())
    }
  })
}

// Canon (and optionally pending) facts that name this entity as subject or object, by name or alias.
export function factsAbout(e: EntityRow, statuses = ['canon']) {
  const names = new Set(namesOf(e).map(normName))
  return listFacts(`status in (${statuses.map(() => '?').join(', ')})`, ...statuses)
    .filter(f => factNames(f).some(n => names.has(normName(n))))
}

const mergeRows = () => useDb().prepare('select name_norm, name, canonical from entity_merges where project_id = ? order by rowid')
  .all(pid()) as { name_norm: string, name: string, canonical: string }[]

// Whether analysis already depends on this page's current name: canon or candidates use it, or names were merged into it.
// A rename then pins it as the analysis name instead of letting it follow the title.
export const identityInUse = (e: EntityRow) => factsAbout(e, ['canon', 'pending']).some(f => [f.subject, f.object].some(n => normName(n) === normName(e.name)))
  || mergeRows().some(m => normName(m.canonical) === normName(e.name))

// Names and aliases must point at one page only, or mentions and fact links would be ambiguous. A name merged away belongs
// to the entity it was merged into: only that one may carry it again (as an alias or title).
export function assertNamesFree(names: string[], exceptId?: string) {
  const taken = new Map<string, string>()
  const all = listEntities()
  for (const e of all) if (e.id !== exceptId) for (const n of namesOf(e)) taken.set(normName(n), e.name)
  const self = all.find(e => e.id === exceptId)
  const merged = new Map(mergeRows().filter(m => !self || normName(m.canonical) !== normName(analysisName(self))).map(m => [m.name_norm, m.canonical]))
  for (const n of names) {
    const owner = taken.get(normName(n))
    if (owner) throw fail(409, 'NAME_TAKEN', owner.toLowerCase() === n.toLowerCase() ? `There is already a page for ${owner}.` : `“${n}” is already a name or alias of ${owner}.`)
    const into = merged.get(normName(n))
    if (into) throw fail(409, 'NAME_TAKEN', `“${n}” was merged into ${into}. Add it as an alias there instead.`)
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

// What a page looks like in the audit trail: enough to rebuild it by hand.
export const snapshot = (e: EntityRow) => ({
  id: e.id, name: e.name, kind: e.kind, summary: e.summary, aliases: aliasesOf(e), fields: fieldsOf(e), notes: e.notes, portrait: !!e.portrait_type,
})

// Merging `src` into `dst`: canon and pending facts naming src's analysis name, or a name merged into src earlier, are
// re-pointed at dst's analysis name (titles and hand-typed aliases never decide this); those names become dst's merged names
// and src's other names (title, hand aliases) become dst aliases;
// empty dst fields are filled from src; src's summary and notes are appended to dst's notes. Rejected and superseded facts
// keep their original wording as history (the new aliases still link them to dst).
export function planMerge(src: EntityRow, dst: EntityRow) {
  if (src.id === dst.id) throw fail(400, 'INVALID', 'Pick a different page to merge into.')
  const canonical = analysisName(dst)
  const moved = new Map([[normName(analysisName(src)), analysisName(src)]])
  for (const m of mergeRows()) if (normName(m.canonical) === normName(analysisName(src))) moved.set(m.name_norm, m.name)
  if (moved.has(normName(canonical))) throw fail(409, 'INVALID', `${dst.name} is already known as ${src.name}.`)
  const facts = (useDb().prepare(`select id, subject, object, statement, status from facts where project_id = ? and status in ('canon', 'pending') order by rowid`)
    .all(pid()) as { id: string, subject: string, object: string | null, statement: string, status: string }[])
    .filter(f => moved.has(normName(f.subject)) || moved.has(normName(f.object)))
  const aliases = [...aliasesOf(dst)]
  const added: string[] = []
  // Names the merge maps (src's analysis name and names merged into it) link to dst as merged names, not hand aliases.
  for (const n of namesOf(src)) {
    if (moved.has(normName(n)) || normName(n) === normName(dst.name) || aliases.some(a => normName(a) === normName(n))) continue
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
    target: { id: dst.id, name: dst.name, kind: dst.kind }, canonical,
    // Both pages carrying their own canon is a sign they may be two different things; the preview warns about it.
    source_canon: facts.filter(f => f.status === 'canon').length, target_canon: factsAbout(dst).length,
    facts, aliases_added: added, fields_filled: filled, summary_taken: !dst.summary && !!src.summary, notes_added: !!carried, portrait,
    apply: { aliases, fields, summary, notes, moved },
  }
}

// What a merge decides beyond the page itself, measured by running the real rules before and after the re-point:
// open rule-based conflicts whose premise the merge removed close as "resolved by merge"; pending change proposals whose
// impact the merge changed are marked stale; the merged names (src's and those merged into it before) map to dst's analysis
// name from now on, so later candidates follow the same identity.
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
  const repoint = (n: string | null) => (n && apply.moved.has(normName(n)) ? plan.canonical : n)
  const upd = d.prepare('update facts set subject = ?, object = ? where id = ?')
  for (const f of plan.facts) upd.run(repoint(f.subject), repoint(f.object), f.id)
  d.prepare(`update entities set analysis_name = ?, aliases = ?, fields = ?, summary = ?, notes = ?, updated_at = ?, updated_by = ? where id = ?`)
    .run(plan.canonical, JSON.stringify(apply.aliases), JSON.stringify(apply.fields), apply.summary, apply.notes, at, by, dst.id)
  if (plan.portrait === 'move') d.prepare('update entities set portrait_type = ?, portrait_at = ? where id = ?').run(src.portrait_type, at, dst.id)
  // Generated images follow the page; the source's portrait marker only survives if its portrait moves.
  if (plan.portrait !== 'move') clearApplied('entity', src.id)
  const images = d.prepare(`update images set target_id = ? where project_id = ? and target_type = 'entity' and target_id = ?`).run(dst.id, pid(), src.id).changes
  d.prepare('delete from entities where id = ?').run(src.id)

  const travelAfter = canon().filter(isTravel)
  const resolved = openConflicts.filter(c => heldBefore.has(c.id) && !holds(c, travelAfter))
  const stale = pending.filter(c => impactKey(c) !== impactBefore.get(c.id))
  const mapped = apply.moved

  // The before-values of every re-pointed fact and the full source page, so the merge can be traced and undone by hand.
  const auditId = audit('entity.merged', 'entity', dst.id, {
    from: snapshot(src), into: dst.name, canonical: plan.canonical, aliases_added: plan.aliases_added, fields_filled: plan.fields_filled, portrait: plan.portrait,
    facts: plan.facts.map(f => ({ id: f.id, subject: f.subject, object: f.object })),
    names_mapped: [...mapped.values()], conflicts_resolved: resolved.map(c => c.id), changes_stale: stale.map(c => c.id), images_moved: images,
  })

  const why = `${src.name} was merged into ${dst.name}, so this is no longer a conflict.`
  for (const c of resolved) {
    d.prepare(`update conflicts set status = 'resolved_by_merge', decided_at = ?, decision_rationale = ?, decided_by = ?, decided_token = ?, merge_audit_id = ? where id = ?`)
      .run(at, why, by, agentToken(), auditId, c.id)
    audit('conflict.resolved_by_merge', 'conflict', c.id, { rule: c.rule, from: src.name, into: dst.name, merge_audit_id: auditId })
  }
  const staleNote = JSON.stringify({ audit_id: auditId, from: src.name, into: dst.name, at })
  for (const c of stale) {
    d.prepare('update changes set impact_stale = ? where id = ?').run(staleNote, c.id)
    audit('impact.stale', 'change', c.id, { from: src.name, into: dst.name, merge_audit_id: auditId })
  }
  // src's analysis name is added; names merged into src earlier move along to dst (their facts were re-pointed above).
  const remember = d.prepare(`insert into entity_merges (name_norm, name, canonical, audit_id, merged_at, merged_by, project_id) values (?, ?, ?, ?, ?, ?, ?)
    on conflict (project_id, name_norm) do update set canonical = excluded.canonical, audit_id = excluded.audit_id, merged_at = excluded.merged_at, merged_by = excluded.merged_by`)
  for (const [norm, name] of mapped) remember.run(norm, name, plan.canonical, auditId, at, by, pid())

  return {
    audit_id: auditId, names_mapped: [...mapped.values()], images_moved: images,
    conflicts_resolved: resolved.map(c => ({ id: c.id, rule: c.rule, rationale: c.rationale })),
    changes_stale: stale.map(c => ({ id: c.id, proposed_statement: c.proposed_statement })),
  }
}

// The merge decision that maps `name` to another entity, if one was made. Only merges write these; hand-typed aliases never do.
// `to` is the analysis name fixed at merge time; entity_id is the page whose analysis name it is now (null if it was deleted).
export function mergedIdentity(name: string | null) {
  if (!name) return null
  const m = useDb().prepare(`select m.canonical, m.audit_id, m.merged_at, u.name merged_by_name from entity_merges m
    left join users u on u.id = m.merged_by where m.project_id = ? and m.name_norm = ?`)
    .get(pid(), normName(name)) as { canonical: string, audit_id: string, merged_at: string, merged_by_name: string | null } | undefined
  if (!m || normName(m.canonical) === normName(name)) return null
  const page = listEntities().find(e => normName(analysisName(e)) === normName(m.canonical))
  return { from: name, to: m.canonical, entity_id: page?.id ?? null, merged_at: m.merged_at, merged_by_name: m.merged_by_name, audit_id: m.audit_id }
}
// Name -> the analysis name it is kept under (merged-away names map to their kept entity; others stay as typed), normalised.
export function keptNameOf() {
  const m = new Map(mergeRows().map(r => [r.name_norm, normName(r.canonical)]))
  return (name: string | null | undefined) => (name ? (m.get(normName(name)) ?? normName(name)) : '')
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
