import { crc32 } from 'node:zlib'

// The story bible: accepted canon (sample canon marked) with verified citations, shaped for a reader outside the studio.
// One builder feeds the Markdown/zip download, the print view (PDF) and public share links, so all three show the same thing.
// Runs inside an access context (pid()); a share link sets one for its project.

const bad = (message: string) => createError({ statusCode: 400, statusMessage: 'INVALID', message })
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? v.split(',') : [])
const flag = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true'

export function cleanBibleOptions(raw: Record<string, unknown>): BibleOptions {
  const scope = (['project', 'entities', 'folder'] as const).find(s => s === raw.scope) ?? 'project'
  const asked = list(raw.sections)
  const sections = raw.sections === undefined ? DEFAULT_SECTIONS : SECTION_KEYS.filter(k => asked.includes(k))
  if (!sections.length) throw bad('Pick at least one section.')
  const entity_ids = scope === 'entities' ? [...new Set(list(raw.entity_ids ?? raw.entities))] : []
  if (scope === 'entities') {
    if (!entity_ids.length) throw bad('Pick at least one entity.')
    if (entity_ids.length > 500) throw bad('Pick at most 500 entities.')
    for (const id of entity_ids) getEntity(id)
  }
  const folder_id = scope === 'folder' ? String(raw.folder_id ?? raw.folder ?? '') : null
  if (scope === 'folder') {
    if (!folder_id) throw bad('Pick a folder.')
    getFolder(folder_id)
  }
  return { scope, entity_ids, folder_id, sections, images: flag(raw.images) }
}

const KIND_ORDER = Object.keys(KIND_LABEL)
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'entity'

export function buildBible(opts: BibleOptions, portrait: (e: EntityRow) => string | null) {
  const db = useDb()
  const { project, studio } = access()
  const on = new Set(opts.sections)
  const all = listEntities()
  const byName = new Map<string, EntityRow>()
  for (const e of all) for (const n of namesOf(e)) byName.set(normName(n), e)
  const entOf = (name: string | null) => (name ? byName.get(normName(name)) : undefined)

  // Scope. A share keeps its options; pages or folders removed since then simply drop out.
  let scoped = listFacts(`status = 'canon'`)
  let label = 'Whole project'
  let chosen: EntityRow[] | null = null
  if (opts.scope === 'entities') {
    chosen = all.filter(e => opts.entity_ids.includes(e.id))
    const ids = new Set(chosen.map(e => e.id))
    scoped = scoped.filter(f => ids.has(entOf(f.subject)?.id ?? '') || ids.has(entOf(f.object)?.id ?? ''))
    const names = chosen.map(e => e.name)
    label = names.length ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}` : 'Selected entities (removed)'
  } else if (opts.scope === 'folder') {
    const folder = db.prepare('select id, name, parent_id from folders where id = ? and project_id = ?').get(opts.folder_id, pid()) as FolderRow | undefined
    const ids = folder ? [folder.id, ...(db.prepare('select id from folders where parent_id = ? and project_id = ?').all(folder.id, pid()) as { id: string }[]).map(r => r.id)] : []
    const docs = new Set((db.prepare(`select id from documents where project_id = ? and folder_id in (${ids.map(() => '?').join(', ') || 'null'})`).all(pid(), ...ids) as { id: string }[]).map(r => r.id))
    scoped = scoped.filter(f => f.evidence.some(e => e.verified && docs.has(e.document_id)))
    label = folder ? `Folder: ${folderPath(folder.id)}` : 'Folder (removed)'
  }
  const scopedIds = new Set(scoped.map(f => f.id))
  const timed = (f: { t_from: number | null, t_to: number | null }) => f.t_from != null || f.t_to != null

  const openConflicts = on.has('conflicts')
    ? (db.prepare(`select rule, origin, rationale, left_fact_id, right_fact_id from conflicts where project_id = ? and status = 'open' order by rowid`).all(pid()) as { rule: string, origin: string, rationale: string, left_fact_id: string, right_fact_id: string }[])
        .filter(c => scopedIds.has(c.left_fact_id) && scopedIds.has(c.right_fact_id))
    : []
  const inConflict = new Set(openConflicts.flatMap(c => [c.left_fact_id, c.right_fact_id]))
  // Only facts a chosen section shows leave the server, numbered F1… in canon order.
  const used = scoped.filter(f => (on.has('facts') && f.kind !== 'rule') || (on.has('rules') && f.kind === 'rule') || (on.has('timeline') && timed(f)) || inConflict.has(f.id))
  const num = new Map(used.map((f, i) => [f.id, `F${i + 1}`]))

  const shown = (chosen ?? [...new Map(scoped.flatMap(f => [entOf(f.subject), entOf(f.object)]).filter(e => !!e).map(e => [e!.id, e!])).values()])
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name))
  const keys = new Map<string, string>()
  for (const e of shown) {
    let k = `e-${slug(e.name)}`
    while ([...keys.values()].includes(k)) k += '-x'
    keys.set(e.id, k)
  }
  const owner = (f: { subject: string, object: string | null }) => [entOf(f.subject), entOf(f.object)].find(e => e && keys.has(e.id))
  const medium = mediumOf((db.prepare('select medium from projects where id = ?').get(pid()) as { medium: string }).medium)

  const facts: BibleFact[] = used.map((f) => {
    const e = f.kind === 'rule' ? undefined : owner(f)
    return {
      n: num.get(f.id)!, kind: f.kind, statement: f.statement, subject: f.subject, predicate: f.predicate, object: f.object,
      time_label: f.time_label, approximate: f.precision === 'approximate', t_from: f.t_from ?? f.t_to, version: f.version, sample: f.origin === 'sample',
      entity: e ? keys.get(e.id)! : null,
      citations: f.evidence.filter(ev => ev.verified).map(ev => ({
        quote: ev.quote, document: ev.document_title, file: ev.document_filename, folder: ev.document_folder, version: ev.document_version,
        latest_version: ev.latest_version, line_from: ev.start_line, line_to: ev.end_line, prior_source: ev.support === 'prior_source',
      })),
    }
  })
  const byFactEntity = (k: string) => (on.has('facts') ? facts.filter(f => f.entity === k && f.kind !== 'rule').map(f => f.n) : [])

  const entities: BibleEntity[] = shown.map((e) => {
    const fields = fieldsOf(e)
    const ed = {
      summary: e.summary, notes: e.notes,
      fields: (MEDIA[medium].fields[e.kind] ?? []).filter(k => fields[k]).map(k => ({ label: FIELD_LABEL[k]!.label, value: fields[k]! })),
    }
    return {
      key: keys.get(e.id)!, name: e.name, kind: e.kind, aliases: aliasesOf(e), facts: byFactEntity(keys.get(e.id)!),
      portrait: opts.images && e.portrait_type ? portrait(e) : null,
      editorial: on.has('editorial') && (ed.summary || ed.notes || ed.fields.length) ? ed : null,
    }
  })

  // Sources appendix: every document a shown fact cites, at the version cited.
  const docs = new Map<string, Bible['sources'][number]>()
  const meta = db.prepare('select sha256, kind from documents where id = ?')
  for (const f of used) {
    for (const ev of f.evidence.filter(x => x.verified)) {
      if (!docs.has(ev.document_id)) {
        const m = meta.get(ev.document_id) as { sha256: string, kind: string }
        docs.set(ev.document_id, { document: ev.document_title, file: ev.document_filename, folder: ev.document_folder, kind: m.kind, version: ev.document_version, latest_version: ev.latest_version, sha256: m.sha256.slice(0, 12), citations: [] })
      }
      docs.get(ev.document_id)!.citations.push({ fact: num.get(f.id)!, line_from: ev.start_line, line_to: ev.end_line, quote: ev.quote })
    }
  }

  const bible: Bible = {
    title: project.name, studio: studio.name, medium: MEDIA[medium].label, generated_at: now(),
    scope: { kind: opts.scope, label }, sections: opts.sections, images: opts.images,
    counts: {
      facts: facts.length, entities: entities.length, documents: docs.size, sample: facts.filter(f => f.sample).length,
      stale: facts.filter(f => f.citations.some(c => c.latest_version > c.version)).length,
    },
    entities, facts,
    other_facts: on.has('facts') ? facts.filter(f => f.kind !== 'rule' && !f.entity).map(f => f.n) : [],
    rules: on.has('rules') ? facts.filter(f => f.kind === 'rule').map(f => f.n) : [],
    timeline: on.has('timeline') ? facts.filter(f => f.t_from != null).sort((a, b) => a.t_from! - b.t_from!).map(f => f.n) : [],
    conflicts: openConflicts.map(c => ({ rule: CONFLICT_RULE_LABEL[c.rule] ?? c.rule, model: c.origin === 'model', rationale: c.rationale, facts: [num.get(c.left_fact_id)!, num.get(c.right_fact_id)!] })),
    sources: on.has('sources') ? [...docs.values()] : [],
  }
  return { bible, rows: new Map(shown.map(e => [keys.get(e.id)!, e])) }
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const cell = (s: string) => s.replaceAll('|', '\\|').replace(/\n+/g, ' ')
const quoteBlock = (s: string) => s.split('\n').map(l => `> ${l}`).join('\n')
export const citeLine = (c: BibleCitation) => [`${c.document} (${[c.folder, c.file].filter(Boolean).join(' / ')})`, `v${c.version}`, lineLabel(c),
  c.prior_source ? 'prior source, wording changed' : '', c.latest_version > c.version ? `stale: source now v${c.latest_version}` : ''].filter(Boolean).join(', ')

// Markdown for the download. imageFile names the portrait file next to the .md (zip), or null for a text-only file.
export function bibleMarkdown(b: Bible, imageFile: (e: BibleEntity) => string | null) {
  const on = new Set(b.sections)
  const fact = new Map(b.facts.map(f => [f.n, f]))
  const out: string[] = [`# ${b.title}: story bible`, '', `${b.studio} · ${b.scope.label} · generated ${day(b.generated_at)}`, '',
    quoteBlock(`Read-only export. Only accepted canon, each fact with the verbatim source quote it rests on.${b.counts.sample ? ' Facts marked “Sample canon (preloaded)” came with a sample project: their quotes are verified, but no person decided them.' : ''}`), '']
  const factBlock = (n: string) => {
    const f = fact.get(n)!
    const tags = [f.kind, f.time_label && `${f.time_label}${f.approximate ? ' (approximate)' : ''}`, f.version > 1 && `v${f.version}`, f.sample && 'Sample canon (preloaded)'].filter(Boolean).join(' · ')
    out.push(`**${f.n}** · ${tags}`, '', f.statement, '')
    for (const c of f.citations) out.push(quoteBlock(`“${c.quote}”`), `> — ${citeLine(c)}`, '')
  }

  if (on.has('overview')) {
    out.push('## Overview', '', `- ${b.counts.facts} canon facts · ${b.counts.entities} entities · ${b.counts.documents} source documents`, `- Scope: ${b.scope.label}`, `- Medium: ${b.medium}`)
    if (b.counts.sample) out.push(`- ${b.counts.sample} sample canon facts (preloaded, not decided by a person)`)
    if (b.counts.stale) out.push(`- ${b.counts.stale} facts cite an older version of their source; re-check them before relying on them`)
    out.push('')
  }
  if (on.has('entities') && b.entities.length) {
    for (const kind of Object.keys(KIND_LABEL) as EntityKind[]) {
      const group = b.entities.filter(e => e.kind === kind)
      if (!group.length) continue
      out.push(`## ${KIND_LABEL[kind].many}`, '')
      for (const e of group) {
        out.push(`### ${e.name}`, '')
        const img = imageFile(e)
        if (img) out.push(`![${e.name}](${img})`, '')
        if (e.aliases.length) out.push(`Also known as: ${e.aliases.join(', ')}`, '')
        if (e.facts.length) out.push(`Canon: ${e.facts.join(', ')}`, '')
        if (e.editorial) {
          out.push('*Editorial notes, not canon:*', '')
          if (e.editorial.summary) out.push(e.editorial.summary, '')
          for (const fl of e.editorial.fields) out.push(`- ${fl.label}: ${fl.value}`)
          if (e.editorial.fields.length) out.push('')
          if (e.editorial.notes) out.push(e.editorial.notes, '')
        }
      }
    }
  }
  if (on.has('facts') && b.facts.some(f => f.kind !== 'rule')) {
    out.push('## Canon by entity', '')
    for (const e of b.entities.filter(x => x.facts.length)) {
      out.push(`### ${e.name}`, '')
      e.facts.forEach(factBlock)
    }
    if (b.other_facts.length) {
      out.push('### Other canon', '')
      b.other_facts.forEach(factBlock)
    }
  }
  if (b.rules.length) {
    out.push('## World rules', '')
    b.rules.forEach(factBlock)
  }
  if (b.timeline.length) {
    out.push('## Timeline', '', '| Story time | Fact | Statement |', '|---|---|---|')
    for (const n of b.timeline) {
      const f = fact.get(n)!
      out.push(`| ${cell(f.time_label ?? '')}${f.approximate ? ' (approx.)' : ''} | ${n} | ${cell(f.statement)} |`)
    }
    out.push('')
  }
  if (on.has('conflicts')) {
    out.push('## Open conflicts', '', b.conflicts.length ? 'Flagged as possible clashes; nobody has judged them yet.' : 'No open conflicts in this scope.', '')
    for (const c of b.conflicts) out.push(`- **${c.rule}**${c.model ? ' (model-suggested)' : ''}: ${c.facts.join(' and ')}. ${c.rationale}`)
    if (b.conflicts.length) out.push('')
  }
  // The timeline and conflicts refer to facts by number; any fact no other section gives in full is given here, with its quote.
  const extra = b.facts.map(f => f.n).filter(n => !shownElsewhere(b, n))
  if (extra.length) {
    out.push('## Facts referenced above', '')
    extra.forEach(factBlock)
  }
  if (b.sources.length) {
    out.push('## Sources', '')
    for (const s of b.sources) {
      out.push(`### ${s.document}`, '', `${[s.folder, s.file].filter(Boolean).join(' / ')} · ${s.kind} · v${s.version}${s.latest_version > s.version ? ` (latest v${s.latest_version})` : ''} · sha256 ${s.sha256}…`, '')
      for (const c of s.citations) out.push(`- ${c.fact}${lineLabel(c) ? `, ${lineLabel(c)}` : ''}: “${c.quote.replace(/\n+/g, ' ')}”`)
      out.push('')
    }
  }
  return `${out.join('\n').trim()}\n`
}

// A stored (uncompressed) zip: enough for one Markdown file and its portraits, without a dependency.
export function zip(files: { name: string, data: Buffer }[]) {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  const d = new Date()
  const dosTime = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1)
  const dosDate = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate()
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const crc = crc32(f.data)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034B50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(0, 8)
    head.writeUInt16LE(dosTime, 10); head.writeUInt16LE(dosDate, 12); head.writeUInt32LE(crc, 14)
    head.writeUInt32LE(f.data.length, 18); head.writeUInt32LE(f.data.length, 22); head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28)
    local.push(head, name, f.data)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014B50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10)
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(f.data.length, 20)
    c.writeUInt32LE(f.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42)
    central.push(c, name)
    offset += 30 + name.length + f.data.length
  }
  const size = central.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, ...central, end])
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

// The download: a .md file, or a .zip with the .md and an images/ folder when portraits are included.
export function bibleDownload(b: Bible, rows: Map<string, EntityRow>, asZip: boolean) {
  const name = `${slug(b.title)}-story-bible`
  if (!asZip) return { filename: `${name}.md`, type: 'text/markdown; charset=utf-8', body: bibleMarkdown(b, () => null) }
  const images = new Map<string, { file: string, data: Buffer }>()
  for (const e of b.entities) {
    const row = rows.get(e.key)
    const data = e.portrait && row?.portrait_type ? readPortrait(row.id) : null
    if (data && row) images.set(e.key, { file: `images/${e.key}.${EXT[row.portrait_type!] ?? 'img'}`, data })
  }
  const md = bibleMarkdown(b, e => images.get(e.key)?.file ?? null)
  return { filename: `${name}.zip`, type: 'application/zip', body: zip([{ name: `${name}.md`, data: Buffer.from(md) }, ...[...images.values()].map(i => ({ name: i.file, data: i.data }))]) }
}
