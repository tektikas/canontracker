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

// A folder and its subfolders (two levels at most).
const folderTree = (folder: FolderRow | undefined) => folder
  ? [folder.id, ...(useDb().prepare('select id from folders where parent_id = ? and project_id = ?').all(folder.id, pid()) as { id: string }[]).map(r => r.id)]
  : []

// Book cover: the applied cover image of the first document (in reading order) that has one. Null = a typographic cover.
function coverImage(filenames: string[], only?: Set<string>) {
  const q = useDb().prepare(`select i.id, i.mime from images i join documents d on d.id = i.target_id where i.project_id = ? and i.target_type = 'document'
    and i.applied_at is not null and d.project_id = i.project_id and d.filename = ? limit 1`)
  for (const f of filenames) {
    if (only && !only.has(f)) continue
    const r = q.get(pid(), f) as { id: string, mime: string } | undefined
    if (r) return r
  }
  return null
}

// Latest version of every document, in reading order: folder path (root first), then title with numbers in order (S2 before S10).
function readingOrder(opts: BibleOptions) {
  const db = useDb()
  const folder = opts.scope === 'folder' ? db.prepare('select id, name, parent_id from folders where id = ? and project_id = ?').get(opts.folder_id, pid()) as FolderRow | undefined : undefined
  const inFolder = new Set(folderTree(folder))
  const paths = new Map<string, string>()
  const path = (id: string | null) => (id ? paths.get(id) ?? (paths.set(id, folderPath(id) ?? ''), paths.get(id)!) : '')
  return sortReadingOrder((db.prepare(`select d.id, d.title, d.filename, d.kind, d.version, d.content, d.folder_id from documents d where d.project_id = ?
    and d.version = (select max(x.version) from documents x where x.project_id = d.project_id and x.filename = d.filename)`).all(pid()) as { id: string, title: string, filename: string, kind: string, version: number, content: string, folder_id: string | null }[])
    .filter(d => opts.scope !== 'folder' || (!!d.folder_id && inFolder.has(d.folder_id)))
    .map(d => ({ ...d, folder: d.folder_id ? path(d.folder_id) : null })))

}

export function buildManuscript(opts: BibleOptions, coverUrl: (imageId: string) => string): Manuscript {
  const { project, studio } = access()
  const docs = readingOrder(opts)
  const folder = opts.scope === 'folder' ? useDb().prepare('select id from folders where id = ? and project_id = ?').get(opts.folder_id, pid()) as { id: string } | undefined : undefined
  const cover = coverImage(docs.map(d => d.filename))
  return {
    title: project.name, studio: studio.name, generated_at: now(),
    scope: { kind: opts.scope, label: opts.scope === 'folder' ? (folder ? `Folder: ${folderPath(folder.id)}` : 'Folder (removed)') : 'Whole project' },
    cover: cover ? coverUrl(cover.id) : null,
    counts: { documents: docs.length, words: docs.reduce((n, d) => n + (d.content.match(/\S+/g)?.length ?? 0), 0) },
    chapters: docs.map((d, i) => ({ key: `ch-${i + 1}`, title: d.title, folder: d.folder, kind: d.kind, version: d.version, text: d.content })),
  }
}

// Only documents inside the export count: for the bible, the ones its facts cite (`cited`); for the manuscript, its own chapters.
export const bookCover = (opts: BibleOptions, cited?: string[]) => coverImage(readingOrder(opts).map(d => d.filename), cited && new Set(cited))

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
    const ids = folderTree(folder)
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

  const types = entityTypes()
  const order = (k: string) => { const i = types.findIndex(t => t.key === k); return i < 0 ? types.length : i }
  const shown = (chosen ?? [...new Map(scoped.flatMap(f => [entOf(f.subject), entOf(f.object)]).filter(e => !!e).map(e => [e!.id, e!])).values()])
    .sort((a, b) => order(a.kind) - order(b.kind) || a.name.localeCompare(b.name))
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
  const names = new Map(used.map(f => [num.get(f.id)!, [entOf(f.subject), entOf(f.object)].map(e => (e ? keys.get(e.id) : undefined))]))
  const namedIn = (k: string) => (on.has('facts') ? facts.filter(f => f.kind !== 'rule' && f.entity !== k && names.get(f.n)!.includes(k)).map(f => f.n) : [])

  const entities: BibleEntity[] = shown.map((e) => {
    const fields = fieldsOf(e)
    const ed = {
      summary: e.summary, notes: e.notes,
      fields: fieldsFor(medium, e.kind).filter(k => fields[k]).map(k => ({ label: FIELD_LABEL[k]!.label, value: fields[k]! })),
    }
    return {
      key: keys.get(e.id)!, name: e.name, kind: e.kind, aliases: aliasesOf(e), facts: byFactEntity(keys.get(e.id)!), named_in: namedIn(keys.get(e.id)!),
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
    // The project's types for the pages shown, in its order (a page whose type was removed keeps a readable label).
    types: [...new Set(shown.map(e => e.kind))].map(k => typeOf(types, k)),
    entities, facts,
    other_facts: on.has('facts') ? facts.filter(f => f.kind !== 'rule' && !f.entity).map(f => f.n) : [],
    rules: on.has('rules') ? facts.filter(f => f.kind === 'rule').map(f => f.n) : [],
    timeline: on.has('timeline') ? facts.filter(f => f.t_from != null).sort((a, b) => a.t_from! - b.t_from!).map(f => f.n) : [],
    conflicts: openConflicts.map(c => ({ rule: CONFLICT_RULE_LABEL[c.rule] ?? c.rule, model: c.origin === 'model', rationale: c.rationale, facts: [num.get(c.left_fact_id)!, num.get(c.right_fact_id)!] })),
    sources: on.has('sources') ? [...docs.values()] : [],
  }
  return { bible, rows: new Map(shown.map(e => [keys.get(e.id)!, e])), cited: [...docs.values()].map(d => d.file) }
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const cell = (s: string) => s.replaceAll('|', '\\|').replace(/\n+/g, ' ')
const quoteBlock = (s: string) => s.split('\n').map(l => `> ${l}`).join('\n')

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
    for (const t of b.types) {
      const group = b.entities.filter(e => e.kind === t.key)
      if (!group.length) continue
      out.push(`## ${t.many}`, '')
      for (const e of group) {
        out.push(`### ${e.name}`, '')
        const img = imageFile(e)
        if (img) out.push(`![${e.name}](${img})`, '')
        if (e.aliases.length) out.push(`Also known as: ${e.aliases.join(', ')}`, '')
        if (e.facts.length) out.push(`Canon: ${e.facts.join(', ')}`, '')
        if (e.named_in.length) out.push(`${e.facts.length ? 'Also named in' : 'Named in'}: ${e.named_in.join(', ')}`, '')
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
  out.push('Made with CanonTracker', '')
  return `${out.join('\n').trim()}\n`
}

// A stored (uncompressed) zip: enough for one Markdown file and its portraits, without a dependency.
export function zip(files: { name: string, data: Buffer }[]) {
  // No ZIP64: 16-bit entry count, 32-bit sizes and offsets. Refuse cleanly; the input cap keeps memory sane too.
  const total = files.reduce((n, f) => n + f.data.length, 0)
  if (files.length > 65535 || total > 256 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'TOO_LARGE', message: 'This export is too large to download as one file. Narrow the scope (a folder or fewer entities) or leave out portraits.' })
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

export function manuscriptMarkdown(m: Manuscript) {
  const out = [`# ${m.title}: manuscript`, '', `${m.studio} · ${m.scope.label} · ${m.counts.documents} documents, ${m.counts.words} words · generated ${day(m.generated_at)}`, '']
  for (const c of m.chapters) {
    out.push(`## ${c.title}`, '')
    // The document's own title line is the chapter heading above.
    out.push(c.text.replace(/\r\n?/g, '\n').replace(new RegExp(`^# ${c.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\n`), '').trim(), '')
  }
  out.push('Made with CanonTracker', '')
  return `${out.join('\n').trim()}\n`
}

// EPUB 3: a stored zip (mimetype first) of XHTML chapters; citations are real footnotes. No dependency.
// XML 1.0 forbids most control chars, U+FFFE/FFFF and lone surrogates; they are dropped, not escaped.
const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
const esc = (s: string) => s.replace(XML_BAD, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const xhtml = (title: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en"><head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" href="style.css"/></head><body>${body}</body></html>`
const EPUB_CSS = `body{font-family:serif;line-height:1.5}h1{margin:1.2em 0 .6em}h2{margin:1.4em 0 .2em}h3{margin:1em 0 .3em}.sub,.small{color:#4a4d55;font-size:.9em}.ed{font-size:.8em;font-weight:bold;text-transform:uppercase;color:#5a5f6b}.fact{margin:.8em 0}.n{font-size:.75em;color:#5d6068;margin-right:.5em}.lab{font-size:.8em;font-weight:bold;margin-right:.5em}aside p{font-size:.85em;margin:.2em 0}img.portrait{max-width:40%;float:right;margin:0 0 .5em 1em}.cover img{max-width:100%}`

export function bookEpub(book: Book, images: Map<string, { file: string, data: Buffer, mime: string }>, cover: { data: Buffer, mime: string } | null) {
  // Markdown emphasis becomes <em> / <strong>; the delimiters are not printed.
  const rich = (t: string) => emphasisRuns(t).filter(r => !r.mark)
    .map(r => (r.strong ? `<strong>${r.em ? `<em>${esc(r.text)}</em>` : esc(r.text)}</strong>` : r.em ? `<em>${esc(r.text)}</em>` : esc(r.text))).join('')
  const para = (p: BookPara) => (p.kind === 'h' ? `<h3>${rich(p.text)}</h3>` : `<p class="${p.kind ?? ''}">${rich(p.text).replace(/\n/g, '<br/>')}</p>`)
  const chapters = book.chapters.map((c, i) => {
    const sections = c.sections.map((s) => {
      const img = s.portraitKey ? images.get(s.portraitKey) : null
      return `<section id="${esc(s.id)}">${s.title ? `<h2>${esc(s.title)}</h2>` : ''}${s.sub ? `<p class="sub">${esc(s.sub)}</p>` : ''}${img ? `<img class="portrait" src="${img.file}" alt="${esc(s.title)}"/>` : ''}${s.paras.map(para).join('')}`
        + s.facts.map(f => `<p class="fact"><span class="n">${esc(f.n)}</span>${f.label ? `<span class="lab">${esc(f.label)}</span>` : ''}${esc(f.statement)}${f.sample ? ' <em>(sample canon)</em>' : ''}${f.notes.map(k => `<a epub:type="noteref" href="#fn${k}"><sup>${k}</sup></a>`).join('')}</p>`).join('') + '</section>'
    }).join('')
    const notes = c.notes.map(n => `<aside epub:type="footnote" id="fn${n.n}"><p>${n.n}. ${esc(n.text)}</p></aside>`).join('')
    return { file: `ch${i + 1}.xhtml`, title: c.title, html: xhtml(emphasisPlain(c.title), `<h1>${rich(c.title)}</h1>${c.intro ? `<p class="sub">${esc(c.intro)}</p>` : ''}${sections}${notes}`) }
  })
  const front = xhtml(book.title, `<h1>${esc(book.title)}</h1><p>${esc(book.kicker)}</p><p class="sub">${esc(book.studio)} · ${esc(book.line)}</p><p class="small">Made with CanonTracker</p>`)
  const nav = xhtml('Contents', `<nav epub:type="toc"><h1>Contents</h1><ol>${chapters.map(c => `<li><a href="${c.file}">${rich(c.title)}</a></li>`).join('')}</ol></nav>`)
  const mediaOf = (f: string, mime: string) => `<item id="${f.replace(/\W/g, '-')}" href="${f}" media-type="${mime}"/>`
  const imgItems = [...images.values()].map(i => mediaOf(i.file, i.mime)).join('')
  const coverExt = cover ? EXT[cover.mime] ?? 'img' : ''
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">urn:uuid:${crypto.randomUUID()}</dc:identifier><dc:title>${esc(`${book.title}: ${book.kicker.toLowerCase()}`)}</dc:title><dc:creator>${esc(book.studio)}</dc:creator><dc:language>en</dc:language>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/><item id="front" href="front.xhtml" media-type="application/xhtml+xml"/>
${cover ? `<item id="cover-img" href="images/cover.${coverExt}" media-type="${cover.mime}" properties="cover-image"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>` : ''}
${chapters.map((c, i) => `<item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`).join('')}${imgItems}</manifest>
<spine>${cover ? '<itemref idref="cover"/>' : ''}<itemref idref="front"/><itemref idref="nav"/>${chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('')}</spine></package>`
  const b = (name: string, text: string) => ({ name, data: Buffer.from(text) })
  return zip([
    b('mimetype', 'application/epub+zip'),
    b('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    b('OEBPS/content.opf', opf), b('OEBPS/nav.xhtml', nav), b('OEBPS/front.xhtml', front), b('OEBPS/style.css', EPUB_CSS),
    ...(cover ? [b('OEBPS/cover.xhtml', xhtml(book.title, `<div class="cover"><img src="images/cover.${coverExt}" alt="Cover"/></div>`)), { name: `OEBPS/images/cover.${coverExt}`, data: cover.data }] : []),
    ...chapters.map(c => b(`OEBPS/${c.file}`, c.html)),
    ...[...images.values()].map(i => ({ name: `OEBPS/${i.file}`, data: i.data })),
  ])
}

// The EPUB download of the bible (book = 'bible') or the manuscript. Portraits go in when the bible carries them.
export function epubDownload(book: Book, kind: BibleBook, rows: Map<string, EntityRow>, coverId: { id: string, mime: string } | null) {
  const images = new Map<string, { file: string, data: Buffer, mime: string }>()
  for (const c of book.chapters) for (const s of c.sections) {
    const row = s.portraitKey ? rows.get(s.portraitKey) : null
    const data = s.portrait && row?.portrait_type ? readPortrait(row.id) : null
    if (data && row) images.set(s.portraitKey!, { file: `images/${s.portraitKey}.${EXT[row.portrait_type!] ?? 'img'}`, data, mime: row.portrait_type! })
  }
  const data = coverId ? readPortrait(coverId.id) : null
  return { filename: `${slug(book.title)}-${kind === 'bible' ? 'story-bible' : 'manuscript'}.epub`, type: 'application/epub+zip', body: bookEpub(book, images, coverId && data ? { data, mime: coverId.mime } : null) }
}
