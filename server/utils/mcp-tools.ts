import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

// Story Bible over MCP. Reads are accepted canon (plus sources and editorial pages, labelled as such); the single write creates
// a PENDING candidate for a human to review. Every handler runs inside the token's access()/pid() context (server/routes/mcp.ts).
//
// Error results are always JSON {"error": {"code", "message"}} with isError. Codes: BAD_INPUT, NOT_FOUND, AMBIGUOUS, FORBIDDEN,
// NOT_CANON, QUOTE_NOT_VERBATIM, DUPLICATE, TOO_LARGE, RATE_LIMITED, INTERNAL.
const MAX_OUT = 60_000 // characters of JSON per tool result; bigger results ask for a smaller page
type Result = { content: { type: 'text', text: string }[], isError?: true }
const refuse = (code: string, message: string, extra: Record<string, unknown> = {}): Result =>
  ({ content: [{ type: 'text', text: JSON.stringify({ error: { code, message, ...extra } }) }], isError: true })
const reply = (data: unknown): Result => {
  const text = JSON.stringify(data)
  if (text.length > MAX_OUT) return refuse('TOO_LARGE', `The result is ${text.length.toLocaleString('en')} characters (max ${MAX_OUT.toLocaleString('en')}). Ask for less: a smaller limit, a line range or fewer ids.`)
  return { content: [{ type: 'text', text }] }
}
class ToolError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}
const UNKNOWN = 'Unknown: accepted canon has nothing on this. Do not assume an answer; ask a human or propose a candidate with a source quote.'
const NOT_CANON_NOTE = 'Editorial wiki text written by the team. It is NOT canon: never cite it as a source or treat it as approved.'
const FACT_KINDS = ['character', 'claim', 'event', 'relationship', 'rule'] as const
const TASK_FILTERS = ['active', 'open', 'in_progress', 'done', 'wont_fix', 'not_needed', 'all'] as const
const STORY_TIME = 'Story time "D<day> HH:MM" or day-only "D<day>" (the whole day); the day may be 0 or negative for before D1, e.g. "D2 14:30", "D-3650"'

// Per token: 120 tool calls a minute. Lists, initialize and pings are not counted.
const toolCalls = fixedWindow(120, 60_000)
const H3_CODES: Record<number, string> = { 400: 'BAD_INPUT', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'BAD_INPUT', 413: 'TOO_LARGE', 422: 'BAD_INPUT', 429: 'RATE_LIMITED' }

type FullFact = ReturnType<typeof listFacts>[number]
type Evidence = FullFact['evidence'][number]

const cite = (e: Evidence) => ({
  quote: e.quote, document_id: e.document_id, file: e.document_filename, folder: e.document_folder, title: e.document_title, document_version: e.document_version,
  lines: e.start_line == null ? null : `${e.start_line}-${e.end_line}`, passage_id: e.passage_id, support: e.support, stale: e.latest_version > e.document_version,
})
function present(f: FullFact) {
  return {
    id: f.id, statement: f.statement, kind: f.kind, subject: f.subject, predicate: f.predicate, object: f.object, value: f.value,
    time: f.time_label, version: f.version, origin: f.origin, // 'sample' = preloaded with a sample project, no person decided it
    evidence: f.evidence.filter(e => e.verified).map(cite),
  }
}
// One line per fact with its first verified source, for lists.
const brief = (f: FullFact) => {
  const e = f.evidence.find(x => x.verified)
  return { fact_id: f.id, statement: f.statement, time: f.time_label, source: e ? { quote: e.quote, document_id: e.document_id, file: e.document_filename, lines: e.start_line == null ? null : `${e.start_line}-${e.end_line}` } : null }
}

const terms = (q: string) => [...new Set(q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 2))]
function searchCanon(query: string, limit: number) {
  const q = query.trim().toLowerCase()
  const ts = terms(query)
  return listFacts('status = ?', 'canon').map((f) => {
    const hay = [f.statement, f.subject, f.object, f.predicate, f.value].filter(Boolean).join(' ').toLowerCase()
    const exact = [f.subject, f.object].some(e => e?.toLowerCase() === q)
    return { f, score: (exact ? 100 : 0) + ts.filter(t => hay.includes(t)).length }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.f)
}

const cursor = z.string().regex(/^\d{1,7}$/).optional().describe('next_cursor from the previous page; omit for the first page')
function paginate<T>(all: T[], at: string | undefined, limit: number) {
  const from = Number(at ?? 0)
  return { total: all.length, next_cursor: from + limit < all.length ? String(from + limit) : null, items: all.slice(from, from + limit) }
}

// A document by id (any version) or by file name (one document only). `version` picks that version of it; otherwise the id's
// own version, or the latest for a file name.
function findDocument(ref: string, version?: number) {
  const db = useDb()
  const byId = db.prepare('select * from documents where project_id = ? and id = ?').get(pid(), ref) as unknown as DocumentRow | undefined
  let filename = byId?.filename
  if (!filename) {
    const named = db.prepare('select distinct filename from documents where project_id = ? and name = ?').all(pid(), ref) as { filename: string }[]
    if (named.length > 1) throw new ToolError('AMBIGUOUS', `${named.length} documents are called "${ref}" (in different folders). Pass the document id from sb_list_documents.`)
    filename = named[0]?.filename
  }
  if (!filename) throw new ToolError('NOT_FOUND', `No imported document "${ref}" in this project. sb_list_documents lists them.`)
  const doc = version != null
    ? db.prepare('select * from documents where project_id = ? and filename = ? and version = ?').get(pid(), filename, version) as unknown as DocumentRow | undefined
    : byId ?? latestDocument(filename)
  if (!doc) throw new ToolError('NOT_FOUND', `"${ref}" has no version ${version}.`)
  return { doc, latest: latestDocument(filename)! }
}

// An entity page by id, or by any name that links to it (title, alias, analysis name, a name merged into it).
function findEntity(ref: string) {
  syncEntities()
  const all = listEntities()
  const e = all.find(x => x.id === ref) ?? all.find(x => namesOf(x).some(n => normName(n) === normName(ref)))
  if (!e) throw new ToolError('NOT_FOUND', `No entity page "${ref}". sb_list_entities lists them; sb_search_facts searches canon.`)
  return e
}

const storyTime = (label: string | undefined, edge: 'from' | 'to', what: string) => {
  if (!label?.trim()) return null
  const t = parseStoryTime(label, edge)
  if (t == null) throw new ToolError('BAD_INPUT', `${what} "${label}" is not a story time. Use "D2 14:30" or "D-3650".`)
  return t
}

const openConflicts = () => useDb().prepare(`select id, rule, severity, origin, left_fact_id, right_fact_id, rationale from conflicts where project_id = ? and status = 'open' order by rowid`)
  .all(pid()) as { id: string, rule: string, severity: string, origin: string, left_fact_id: string, right_fact_id: string, rationale: string }[]

export function buildMcpServer(token: { id: string, name: string }) {
  const server = new McpServer({ name: 'story-bible', version: '1.1.0' }, {
    instructions: 'Story Bible holds a game studio\'s approved narrative canon with verbatim source quotes. Before writing lore, read canon: sb_get_entity / sb_get_context_pack for a character or place, '
      + 'sb_get_timeline for when things happen, sb_read_document for the source text. Before proposing new lore, run sb_check_facts to see the rule-based conflicts it would raise. '
      + 'If canon has nothing, say so ("unknown"); never invent facts, ids or quotes. Entity summaries, fields and notes are editorial, not canon. '
      + 'You cannot change canon: sb_propose_candidate adds a pending candidate that a person reviews in the web app.',
  })
  // Every handler: the per-token rate limit, and thrown errors as JSON error results with a code (never a stack trace).
  // Wrapping registerTool keeps each call's own typed arguments.
  const register = server.registerTool.bind(server)
  server.registerTool = ((name: string, config: never, cb: (...a: unknown[]) => unknown) => register(name, config, (async (...args: unknown[]) => {
    const wait = toolCalls(token.id)
    if (wait) return refuse('RATE_LIMITED', `Too many tool calls for this token (120 a minute). Retry in ${Math.ceil(wait / 1000)} s.`, { retry_after_s: Math.ceil(wait / 1000) })
    try {
      return await cb(...args)
    } catch (e) {
      if (e instanceof ToolError) return refuse(e.code, e.message)
      const status = (e as { statusCode?: number }).statusCode ?? 500
      if (status >= 500) console.error(`[mcp] ${name}`, e)
      return refuse(H3_CODES[status] ?? 'INTERNAL', status < 500 ? (e as Error).message : 'Story Bible failed on this call. Try again; if it keeps failing, tell the studio.')
    }
  }) as never)) as typeof server.registerTool
  // Arguments that fail the input schema (wrong type, too long, unknown enum) and unknown tools: the same JSON error shape.
  // createToolError is the SDK's own hook for these (not in its typings).
  Object.assign(server, { createToolError: (message: string) => refuse('BAD_INPUT', message) })
  const read = { readOnlyHint: true, openWorldHint: false }

  server.registerTool('sb_list_projects', {
    title: 'Project and role',
    description: 'The project this token is scoped to (one token = one project), your role in it, and counts of documents, entity pages, canon facts, pending candidates, open conflicts and open tasks. Call first to confirm what you are connected to. Example: {}',
    annotations: read,
  }, () => {
    const { project, studio, role, user } = access()
    const n = (sql: string) => (useDb().prepare(sql).get(pid()) as { n: number }).n
    return reply({
      projects: [{ id: project.id, name: project.name, studio: studio.name, medium: project.medium, your_role: role, acting_for: user.name,
        documents: n(`select count(distinct filename) n from documents where project_id = ?`),
        entities: n(`select count(*) n from entities where project_id = ?`),
        canon_facts: n(`select count(*) n from facts where project_id = ? and status = 'canon'`),
        pending_candidates: n(`select count(*) n from facts where project_id = ? and status = 'pending'`),
        open_conflicts: n(`select count(*) n from conflicts where project_id = ? and status = 'open'`),
        open_tasks: n(`select count(*) n from tasks where project_id = ? and status in ('open', 'in_progress')`) }],
      can_propose: atLeast(role, 'editor'),
    })
  })

  server.registerTool('sb_get_context_pack', {
    title: 'Canon briefing on a topic',
    description: 'Compact briefing on an entity (character, place, faction, rule) or topic: the accepted canon facts about it, each with verbatim source quotes and document ids/lines, plus open conflicts touching them. Use before writing or editing lore. Returns status "unknown" when canon has nothing. Example: {"topic": "Odo", "limit": 15}',
    inputSchema: { topic: z.string().min(1).max(200).describe('Entity name or topic, e.g. "Mara Venn" or "tide bell rules"'), limit: z.number().int().min(1).max(40).default(15).optional() },
    annotations: read,
  }, ({ topic, limit }) => {
    // A topic that names an entity page reads canon by that page's identity: its analysis name plus names merged into it (never titles or hand aliases).
    const page = listEntities().find(e => namesOf(e).some(n => normName(n) === normName(topic)))
    const idn = page ? new Set([analysisName(page), ...mergedFrom(page)].map(normName)) : null
    const byIdentity = idn ? listFacts('status = ?', 'canon').filter(f => idn.has(normName(f.subject)) || (f.object != null && idn.has(normName(f.object)))) : []
    const facts = [...new Map([...byIdentity, ...searchCanon(topic, limit ?? 15)].map(f => [f.id, f])).values()].slice(0, limit ?? 15)
    if (!facts.length) return reply({ status: 'unknown', topic, message: UNKNOWN, facts: [] })
    const ids = new Set(facts.map(f => f.id))
    const conflicts = openConflicts().filter(c => ids.has(c.left_fact_id) || ids.has(c.right_fact_id))
    return reply({ status: 'ok', topic, ...(page && { entity: { id: page.id, name: page.name, analysis_name: analysisName(page), merged_names: mergedFrom(page) } }), scope: 'accepted canon only', facts: facts.map(present), open_conflicts_touching_these: conflicts })
  })

  server.registerTool('sb_search_facts', {
    title: 'Search canon',
    description: 'Keyword search over accepted canon facts (statement, subject, object). Returns compact hits with ids; use sb_get_fact for full evidence. Empty result means canon has nothing on it ("unknown"), not that it is false. Example: {"query": "Ashbell voice", "limit": 10}',
    inputSchema: { query: z.string().min(1).max(200), limit: z.number().int().min(1).max(50).default(10).optional() },
    annotations: read,
  }, ({ query, limit }) => {
    const hits = searchCanon(query, limit ?? 10)
    return reply({ status: hits.length ? 'ok' : 'unknown', query, ...(hits.length ? {} : { message: UNKNOWN }),
      facts: hits.map(f => ({ id: f.id, statement: f.statement, subject: f.subject, predicate: f.predicate, object: f.object, time: f.time_label, origin: f.origin })) })
  })

  server.registerTool('sb_get_fact', {
    title: 'One canon fact',
    description: 'One fact by id with status and all its evidence (verbatim quote, document id, file, line range). Accepted canon only; pending, rejected and superseded facts are refused (NOT_CANON). Example: {"fact_id": "fact_0123abcd4567ef89"}',
    inputSchema: { fact_id: z.string().min(1).max(64) },
    annotations: read,
  }, ({ fact_id }) => {
    const [f] = listFacts('id = ?', fact_id)
    if (!f) return refuse('NOT_FOUND', `No fact ${fact_id} in this project.`)
    if (f.status !== 'canon') return refuse('NOT_CANON', `Fact ${fact_id} is ${f.status}, not accepted canon. Only accepted canon is readable.`)
    return reply({ ...present(f), status: f.status, origin: f.origin, supersedes_id: f.supersedes_id,
      ...(f.agent_name ? { proposed_by_agent: f.agent_name, proposed_for: f.proposed_by_name } : {}) })
  })

  server.registerTool('sb_list_documents', {
    title: 'List source documents',
    description: 'The imported source documents (scenes, lore, dialogue…) at their latest version: id, title, file name, folder, kind, tags, version, how many canon facts cite it and how many of those need a re-check after a newer version. Paginated. Filters combine. Example: {"kind": "scene", "folder": "Act 1", "limit": 20}',
    inputSchema: {
      kind: z.enum(DOCUMENT_KINDS).optional(),
      folder: z.string().max(120).optional().describe('Folder name or path, e.g. "Act 1" or "Act 1 / Scenes" (case-insensitive; a folder includes its subfolders)'),
      tag: z.string().max(60).optional().describe('Tag name, case-insensitive'),
      query: z.string().max(120).optional().describe('Words in the title or file name'),
      needs_recheck: z.boolean().optional().describe('Only documents with canon citations to re-check'),
      limit: z.number().int().min(1).max(100).default(50).optional(), cursor,
    },
    annotations: read,
  }, ({ kind, folder, tag, query, needs_recheck, limit, cursor: at }) => {
    const tags = new Map((useDb().prepare('select id, name from tags where project_id = ?').all(pid()) as { id: string, name: string }[]).map(t => [t.id, t.name]))
    const paths = new Map<string, string | null>()
    const pathOf = (id: string | null) => (id ? paths.get(id) ?? paths.set(id, folderPath(id)).get(id)! : null)
    const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    const f = folder?.trim().toLowerCase().replace(/\s*\/\s*/g, ' / ')
    const rows = latestDocuments().map(d => ({ d, folder: pathOf(d.folder_id), tags: d.tags.map(t => tags.get(t)!).filter(Boolean) })).filter(({ d, folder: p, tags: ts }) =>
      (!kind || d.kind === kind)
      && (!f || (!!p && (p.toLowerCase() === f || p.toLowerCase().startsWith(`${f} / `) || p.toLowerCase().endsWith(` / ${f}`))))
      && (!tag || ts.some(t => normName(t) === normName(tag)))
      && words.every(w => `${d.title} ${d.name}`.toLowerCase().includes(w))
      && (!needs_recheck || d.stale_facts > 0))
    const page = paginate(rows, at, limit ?? 50)
    return reply({ total: page.total, next_cursor: page.next_cursor, documents: page.items.map(({ d, folder: p, tags: ts }) => ({
      id: d.id, title: d.title, file: d.name, folder: p, kind: d.kind, tags: ts, version: d.version, passages: d.passages,
      canon_facts: d.canon_facts, pending_candidates: d.pending_facts, recheck: { facts: d.stale_facts, outdated: d.outdated_facts },
      updated_at: d.imported_at, updated_by: d.created_by_name, origin: d.origin,
    })) })
  })

  server.registerTool('sb_read_document', {
    title: 'Read a source document',
    description: 'Source text of one document, passage by passage (a passage is a paragraph or heading), with line numbers and the canon facts citing each passage. Latest version unless you pass version. Narrow with a line range or passage ids; long results are paged (next_cursor) and capped by max_chars; a passage longer than max_chars comes in parts (part.from_char/to_char), join them before quoting. Copy quotes for sb_propose_candidate from here, character for character. Example: {"document": "S03-the-kettle-and-coal.md", "from_line": 1, "to_line": 40}',
    inputSchema: {
      document: z.string().min(1).max(200).describe('Document id (any version) or file name'),
      version: z.number().int().min(1).optional().describe('A specific version; default: the latest (or the version the id names)'),
      from_line: z.number().int().min(1).optional(), to_line: z.number().int().min(1).optional(),
      passage_ids: z.array(z.string().max(64)).min(1).max(50).optional().describe('Only these passages (ids from evidence or a previous read)'),
      max_chars: z.number().int().min(500).max(30_000).default(12_000).optional().describe('Text budget per page'),
      cursor: z.string().regex(/^\d{1,7}(:\d{1,9})?$/).optional().describe('next_cursor from the previous page; omit for the first page'),
    },
    annotations: read,
  }, ({ document, version, from_line, to_line, passage_ids, max_chars, cursor: at }) => {
    const { doc, latest } = findDocument(document, version)
    const db = useDb()
    const all = db.prepare('select id, start_line, end_line, text from passages where document_id = ? order by ordinal').all(doc.id) as { id: string, start_line: number, end_line: number, text: string }[]
    const ids = passage_ids && new Set(passage_ids)
    const chosen = all.filter(p => (!ids || ids.has(p.id)) && (from_line == null || p.end_line >= from_line) && (to_line == null || p.start_line <= to_line))
    const budget = max_chars ?? 12_000
    // Cursor "i" = start at chosen passage i; "i:c" = continue passage i from character c (a passage longer than the budget
    // comes in parts, so every character is reachable; join the parts before quoting).
    const [from, start] = (at ?? '0').split(':').map(Number) as [number, number | undefined]
    const out: { id: string, lines: string, text: string, part?: { from_char: number, to_char: number, of: number } }[] = []
    let used = 0
    let i = from
    let off = start ?? 0
    let next: string | null = null
    // Whole passages until the budget is spent; the first one on a page always comes back, in parts if it alone is longer.
    for (; i < chosen.length; i++, off = 0) {
      const p = chosen[i]!
      off = Math.min(off, p.text.length)
      const rest = p.text.length - off
      if (out.length && used + rest > budget) break
      const take = Math.min(rest, budget)
      const part = take < p.text.length ? { part: { from_char: off, to_char: off + take, of: p.text.length } } : {}
      out.push({ id: p.id, lines: `${p.start_line}-${p.end_line}`, text: p.text.slice(off, off + take), ...part })
      used += take
      if (take < rest) { next = `${i}:${off + take}`; break }
    }
    if (!next && i < chosen.length) next = String(i)
    const cited = new Map<string, string[]>()
    if (out.length) {
      for (const r of db.prepare(`select e.passage_id, e.fact_id from evidence e join facts f on f.id = e.fact_id
        where f.project_id = ? and f.status = 'canon' and e.verified = 1 and e.passage_id in (select value from json_each(?))`).all(pid(), JSON.stringify(out.map(p => p.id))) as { passage_id: string, fact_id: string }[])
        cited.set(r.passage_id, [...(cited.get(r.passage_id) ?? []), r.fact_id])
    }
    const missing = ids ? [...ids].filter(id => !all.some(p => p.id === id)) : []
    return reply({
      document: { id: doc.id, title: doc.title, file: doc.name, folder: folderPath(doc.folder_id), kind: doc.kind, version: doc.version, latest_version: latest.version,
        latest_id: latest.id, lines: all.at(-1)?.end_line ?? 0, passages: all.length },
      ...(doc.version < latest.version ? { note: `This is version ${doc.version}; the latest is ${latest.version} (${latest.id}). New candidates must quote the latest version.` } : {}),
      ...(missing.length ? { not_in_this_version: missing } : {}),
      matched_passages: chosen.length, next_cursor: next,
      passages: out.map(p => ({ ...p, canon_fact_ids: cited.get(p.id) ?? [] })),
    })
  })

  server.registerTool('sb_list_entities', {
    title: 'List entity pages',
    description: 'The project\'s wiki pages (characters, locations, items, factions, events and any types the team made): id, name, type, aliases and how many canon facts name it. The summary is editorial (not canon). Paginated. Example: {"type": "character", "query": "odo"}',
    inputSchema: {
      type: z.string().max(40).optional().describe('Entity type key, e.g. "character", "location"; the result lists the project\'s types'),
      query: z.string().max(120).optional().describe('Words in a name or alias'),
      limit: z.number().int().min(1).max(200).default(100).optional(), cursor,
    },
    annotations: read,
  }, ({ type, query, limit, cursor: at }) => {
    syncEntities()
    const types = entityTypes()
    if (type && !types.some(t => t.key === type)) return refuse('BAD_INPUT', `Unknown type "${type}". This project's types: ${types.map(t => t.key).join(', ')}.`)
    const counts = new Map<string, number>()
    for (const f of useDb().prepare(`select subject, object from facts where project_id = ? and status = 'canon'`).all(pid()) as { subject: string, object: string | null }[])
      for (const n of new Set([normName(f.subject), normName(f.object)])) if (n) counts.set(n, (counts.get(n) ?? 0) + 1)
    const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    const rows = listEntities().filter(e => (!type || e.kind === type) && words.every(w => namesOf(e).join(' ').toLowerCase().includes(w)))
    const page = paginate(rows, at, limit ?? 100)
    return reply({
      types: types.map(t => ({ key: t.key, label: t.one })), total: page.total, next_cursor: page.next_cursor,
      entities: page.items.map((e) => {
        const names = namesOf(e)
        return { id: e.id, name: e.name, type: e.kind, aliases: aliasesOf(e), merged_names: mergedFrom(e),
          canon_facts: [...new Set(names.map(normName))].reduce((n, k) => n + (counts.get(k) ?? 0), 0),
          summary_not_canon: e.summary ? (e.summary.length > 160 ? `${e.summary.slice(0, 159)}…` : e.summary) : null }
      }),
    })
  })

  server.registerTool('sb_get_entity', {
    title: 'Brief on one entity',
    description: 'Everything about one entity page: canon facts naming it (with quotes and sources), its relationships and timeline from canon, open conflicts touching it, pending candidates, where it appears in the sources, and the team\'s editorial wiki text (summary, aliases, typed fields, notes) clearly marked not canon. canon.status is "unknown" when no accepted fact names it. Example: {"entity": "Odo"}',
    inputSchema: {
      entity: z.string().min(1).max(200).describe('Entity id, name or alias'),
      facts_limit: z.number().int().min(1).max(100).default(40).optional().describe('Max canon facts with full evidence'),
    },
    annotations: read,
  }, ({ entity, facts_limit }) => {
    const e = findEntity(entity)
    const facts = factsAbout(e)
    const self = new Set(namesOf(e).map(normName))
    const ids = new Set(facts.map(f => f.id))
    const timed = facts.filter(f => f.t_from != null || f.t_to != null).sort((a, b) => (a.t_from ?? a.t_to!) - (b.t_from ?? b.t_to!))
    // Appearances: read-time name matches on the latest version of each source, like the wiki page.
    const re = mentionPattern(namesOf(e))
    const passages = useDb().prepare(`select p.id, p.document_id, p.start_line, p.end_line, p.text, d.title, d.name, d.kind from passages p join documents d on d.id = p.document_id
      where p.project_id = ? and d.version = (select max(version) from documents d2 where d2.filename = d.filename and d2.project_id = d.project_id)
      order by d.rowid, p.ordinal`).all(pid()) as { id: string, document_id: string, start_line: number, end_line: number, text: string, title: string, name: string, kind: string }[]
    const docs = new Map<string, { document_id: string, title: string, file: string, kind: string, mentions: number, passages: { id: string, lines: string }[] }>()
    for (const p of passages) {
      if (!re || !(re.lastIndex = 0, re.test(p.text))) continue
      const d = docs.get(p.document_id) ?? docs.set(p.document_id, { document_id: p.document_id, title: p.title, file: p.name, kind: p.kind, mentions: 0, passages: [] }).get(p.document_id)!
      d.mentions++
      if (d.passages.length < 8) d.passages.push({ id: p.id, lines: `${p.start_line}-${p.end_line}` })
    }
    const fields = Object.entries(fieldsOf(e)).map(([k, v]) => ({ field: FIELD_LABEL[k]?.label ?? k, value: v }))
    return reply({
      id: e.id, name: e.name, type: e.kind, analysis_name: analysisName(e), names: namesOf(e), merged_names: mergedFrom(e),
      canon: {
        status: facts.length ? 'ok' : 'unknown', ...(facts.length ? {} : { message: UNKNOWN }), total_facts: facts.length,
        facts: facts.slice(0, facts_limit ?? 40).map(present),
        relationships: facts.filter(f => f.kind === 'relationship').map(f => {
          const outgoing = self.has(normName(f.subject))
          return { fact_id: f.id, predicate: f.predicate, direction: outgoing ? 'outgoing' : 'incoming', other: outgoing ? f.object : f.subject, time: f.time_label, statement: f.statement }
        }),
        timeline: timed.map(f => ({ fact_id: f.id, time: f.time_label, statement: f.statement })),
      },
      open_conflicts: openConflicts().filter(c => ids.has(c.left_fact_id) || ids.has(c.right_fact_id)).map(({ left_fact_id, right_fact_id, ...c }) => ({ ...c, fact_ids: [left_fact_id, right_fact_id] })),
      pending_candidates: factsAbout(e, ['pending']).length,
      appearances: { documents: docs.size, list: [...docs.values()].slice(0, 30) },
      editorial: { not_canon: NOT_CANON_NOTE, summary: e.summary || null, aliases: aliasesOf(e), fields, notes: e.notes ? (e.notes.length > 2000 ? `${e.notes.slice(0, 1999)}…` : e.notes) : null },
    })
  })

  server.registerTool('sb_get_timeline', {
    title: 'Canon timeline',
    description: `Accepted canon facts with a story time, in story order: what happens when, with a source for each. Filter by a time window and/or an entity. ${STORY_TIME}. A day-only time ("D5") means some time that day; "~" marks approximate times; negative days are before the story starts. Paginated. Example: {"entity": "Odo", "from": "D1", "to": "D2 23:59"}`,
    inputSchema: {
      entity: z.string().max(200).optional().describe('Entity id, name or alias'),
      from: z.string().max(20).optional().describe('Window start, e.g. "D1" or "D-3650"'),
      to: z.string().max(20).optional().describe('Window end, e.g. "D3 12:00"; a day-only end covers that whole day'),
      limit: z.number().int().min(1).max(200).default(100).optional(), cursor,
    },
    annotations: read,
  }, ({ entity, from, to, limit, cursor: at }) => {
    const lo = storyTime(from, 'from', 'from')
    const hi = storyTime(to, 'to', 'to')
    const facts = entity ? factsAbout(findEntity(entity)) : listFacts('status = ?', 'canon')
    const rows = facts.filter(f => f.t_from != null || f.t_to != null)
      .map(f => ({ f, start: f.t_from ?? f.t_to!, end: f.t_to ?? f.t_from! }))
      .filter(r => (lo == null || r.end >= lo) && (hi == null || r.start <= hi))
      .sort((a, b) => a.start - b.start || a.end - b.end)
    const page = paginate(rows, at, limit ?? 100)
    return reply({
      scope: 'accepted canon only', window: { from: from ?? null, to: to ?? null }, total: page.total, next_cursor: page.next_cursor,
      ...(page.total ? {} : { note: 'No timed canon facts in this window. That is "unknown", not "nothing happens".' }),
      events: page.items.map(({ f }) => ({ ...brief(f), subject: f.subject, predicate: f.predicate, object: f.object,
        day_only: isDayOnlyLabel(f.time_label), approximate: f.precision === 'approximate', before_story: (f.t_from ?? f.t_to!) < 0 })),
    })
  })

  server.registerTool('sb_ask', {
    title: 'Ask the canon',
    description: 'A question answered from accepted canon only, the same as Ask in the web app: the answer (when a live model is configured) plus the canon facts it rests on, each with quotes. status: "supported" (answer + citations), "source_only" (the matching facts, no prose answer: recorded mode or model offline) or "unknown" (canon has nothing; do not guess). Example: {"question": "Who rang the Ashbell before the story starts?"}',
    inputSchema: { question: z.string().min(3).max(500) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ question }) => {
    const r = await askCanon(question.trim())
    return reply({ status: r.status, question: r.question, answer: r.answer, ...(r.status === 'unknown' ? { message: UNKNOWN } : {}),
      cited: r.cited.map(present), model: r.model.label, trace_id: r.trace_id, ...(r.model_error ? { model_error: r.model_error } : {}) })
  })

  server.registerTool('sb_check_facts', {
    title: 'Continuity check (nothing stored)',
    description: 'Dry-run continuity check: pass the facts a scene or draft would add and get the rule-based conflicts they would raise against accepted canon, and among themselves. Nothing is stored. Deterministic, no model. Rules: '
      + 'EXACT/APPROX_TIME_LOCATION_OVERLAP (same subject, predicate "located_at", object = the place, overlapping clock times), TRAVEL_TIME_TOO_SHORT (two located_at facts closer than a canon "travel_time" fact allows; travel_time: subject and object are the two places, value = minutes), '
      + 'RELATIONSHIP_AFTER_END (kind "relationship", same predicate and object, used after a canon relationship ended at time_to). Day-only times never clash on place. World-rule checks need a model and are not run. '
      + `No hits is not proof of consistency. ${STORY_TIME}. Example: {"facts": [{"kind": "event", "subject": "Odo", "predicate": "located_at", "object": "Saltgate", "time_from": "D1 21:00", "time_to": "D1 22:00"}]}`,
    inputSchema: {
      facts: z.array(z.object({
        kind: z.enum(FACT_KINDS).default('event'),
        subject: z.string().min(1).max(200), predicate: z.string().min(1).max(80),
        object: z.string().max(200).optional(), value: z.string().max(200).optional(),
        time_from: z.string().max(20).optional(), time_to: z.string().max(20).optional(),
        time_precision: z.enum(['exact', 'approximate']).optional().describe('Default exact when a time is given'),
        statement: z.string().max(500).optional().describe('The fact as a sentence, echoed back'),
      })).min(1).max(20),
    },
    annotations: read,
  }, ({ facts: input }) => {
    const db = useDb()
    const canon = db.prepare(`select * from facts where project_id = ? and status = 'canon'`).all(pid()) as unknown as Fact[]
    // Names merged away are analysed under the kept name, as they would be on accept.
    const kept = (n: string | null | undefined) => (n ? mergedIdentity(n)?.to ?? n.trim() : null)
    const proposed: Fact[] = input.map((p, i) => {
      const { from, to, bad, day } = parseStoryRange(p.time_from, p.time_to)
      if (bad) throw new ToolError('BAD_INPUT', `facts[${i}]: ${STORY_TIME}.`)
      if (from != null && to != null && to < from) throw new ToolError('BAD_INPUT', `facts[${i}]: time_to is before time_from.`)
      const precision = from != null || to != null ? (p.time_precision ?? 'exact') : null
      return { id: `proposed[${i}]`, kind: p.kind, subject: kept(p.subject)!, predicate: p.predicate.trim(), object: kept(p.object), value: p.value?.trim() || null,
        statement: p.statement?.trim() || `${p.subject} ${p.predicate}${p.object ? ` ${p.object}` : ''}${p.value ? ` ${p.value}` : ''}`,
        t_from: from, t_to: to, time_label: timeLabel(from, to, precision, day), precision, status: 'proposed', confidence: null, origin: 'agent:check', model_id: null,
        version: 1, supersedes_id: null, created_at: now(), decided_at: null, rationale: null, decided_by: null, project_id: pid(), created_by: null }
    })
    const travel = [...canon, ...proposed].filter(isTravel)
    const hits: ReturnType<typeof ruleHits> = []
    for (const [i, a] of proposed.entries()) {
      for (const b of canon) hits.push(...ruleHits(a, b, travel))
      for (const b of proposed.slice(i + 1)) hits.push(...ruleHits(a, b, travel))
    }
    // A new travel time can turn two canon placements into a conflict: report those pairs too (canon-only hits already exist).
    if (proposed.some(isTravel)) {
      const canonTravel = canon.filter(isTravel)
      for (const [i, a] of canon.entries()) {
        for (const b of canon.slice(i + 1)) {
          const before = new Set(ruleHits(a, b, canonTravel).map(h => h.rule))
          hits.push(...ruleHits(a, b, travel).filter(h => !before.has(h.rule)))
        }
      }
    }
    const canonFacts = new Map(listFacts(`status = 'canon'`).map(f => [f.id, f]))
    const side = (f: Fact) => (f.status === 'proposed' ? { proposed_index: Number(f.id.slice(9, -1)), statement: f.statement, time: f.time_label } : brief(canonFacts.get(f.id)!))
    const severity = severityFor(access().project.severity_defaults)
    const known = new Set(listEntities().flatMap(namesOf).map(normName))
    return reply({
      checked_against: `accepted canon (${canon.length} facts)`, stored: false,
      // As analysed: a name merged away reads as the kept entity's name.
      proposed: proposed.map((f, i) => ({ index: i, statement: f.statement, subject: f.subject, predicate: f.predicate, object: f.object, time: f.time_label,
        subject_known: known.has(normName(f.subject)) })),
      would_raise: hits.map(h => ({ rule: h.rule, severity: severity(h.rule, h.near), confidence: h.confidence, rationale: h.rationale, left: side(h.a), right: side(h.b) })),
      not_checked: 'WORLD_RULE_VIOLATION (needs a model and a person) and anything outside the rules above.',
      ...(hits.length ? {} : { note: 'No rule-based conflict found against accepted canon. This is not proof of consistency: only the rules above ran.' }),
    })
  })

  server.registerTool('sb_list_conflicts', {
    title: 'Possible conflicts',
    description: 'Possible canon conflicts found by the rule checks (time/place overlap, travel time, relationship after end, world-rule violations). These are candidates for a human to judge, not verdicts. Default: open ones. Paginated. Example: {"status": "open"}',
    inputSchema: { status: z.enum(['open', 'confirmed', 'false_positive', 'uncertain', 'resolved_by_merge', 'all']).default('open').optional(), limit: z.number().int().min(1).max(100).default(50).optional(), cursor },
    annotations: read,
  }, ({ status, limit, cursor: at }) => {
    const s = status ?? 'open'
    const rows = useDb().prepare(`select * from conflicts where project_id = ? ${s === 'all' ? '' : 'and status = ?'} order by rowid`)
      .all(...(s === 'all' ? [pid()] : [pid(), s])) as unknown as ConflictRow[]
    const page = paginate(rows, at, limit ?? 50)
    const stmt = (id: string) => (useDb().prepare('select id, statement, time_label time from facts where id = ? and project_id = ?').get(id, pid()) as { id: string, statement: string, time: string | null })
    return reply({ status_filter: s, count: page.total, next_cursor: page.next_cursor, conflicts: page.items.map(c => ({
      id: c.id, rule: c.rule, severity: c.severity, origin: c.origin === 'model' ? 'model-suggested' : 'rule', status: c.status, confidence: c.confidence,
      rationale: c.rationale, left: stmt(c.left_fact_id), right: stmt(c.right_fact_id),
    })) })
  })

  server.registerTool('sb_get_impact', {
    title: 'Impact of a change',
    description: 'What a change would touch: accepted facts and scenes within max 2 hops of a canon fact (fact_id), or the stored impact of an existing change proposal (change_id). Pass exactly one. Each item has path, evidence ids and rationale. An empty list means "no impact found within accepted canon, max 2 hops", not a guarantee of none. Example: {"fact_id": "fact_0123abcd4567ef89"}',
    inputSchema: { fact_id: z.string().max(64).optional(), change_id: z.string().max(64).optional() },
    annotations: read,
  }, ({ fact_id, change_id }) => {
    if (!!fact_id === !!change_id) return refuse('BAD_INPUT', 'Pass exactly one of fact_id or change_id.')
    const scope = { max_hops: 2, canonical_only: true }
    if (fact_id) {
      const f = useDb().prepare('select status from facts where id = ? and project_id = ?').get(fact_id, pid()) as { status: string } | undefined
      if (!f) return refuse('NOT_FOUND', `No fact ${fact_id} in this project.`)
      if (f.status !== 'canon') return refuse('NOT_CANON', `Fact is ${f.status}; impact is only computed for accepted canon.`)
      const items = analyzeImpact(fact_id)
      return reply({ fact_id, scope, items, ...(items.length ? {} : { note: 'No impact found within accepted canon, max 2 hops.' }) })
    }
    const c = useDb().prepare('select * from changes where id = ? and project_id = ?').get(change_id!, pid()) as unknown as ChangeRow | undefined
    if (!c) return refuse('NOT_FOUND', `No change ${change_id} in this project.`)
    const items = JSON.parse(c.impact ?? '[]') as ImpactItem[]
    return reply({ change_id, status: c.status, before: c.before_statement, proposed: c.proposed_statement, scope, items,
      ...(c.impact_stale ? { impact_stale: 'A merge changed this impact; a person must re-run the analysis before accepting.' } : {}),
      ...(items.length ? {} : { note: 'No impact found within accepted canon, max 2 hops.' }) })
  })

  server.registerTool('sb_list_recheck', {
    title: 'Citations to re-check',
    description: 'Canon facts whose citation points at an older version of its source after a new version was imported. "outdated": the quoted words are gone from the latest version (or appear more than once), a person must decide; "unchanged": the words still read the same, a person only confirms. Read-only: re-pinning is done by a person in the web app. Paginated. Example: {"state": "outdated"}',
    inputSchema: { state: z.enum(['outdated', 'unchanged', 'all']).default('all').optional(), limit: z.number().int().min(1).max(100).default(50).optional(), cursor },
    annotations: read,
  }, ({ state, limit, cursor: at }) => {
    const cites = staleCanonCitations().filter(c => c.state !== 'kept')
    const byFact = recheckByFact(cites)
    const want = [...byFact].filter(([, s]) => (state ?? 'all') === 'all' || s === state).map(([id]) => id)
    const page = paginate(want, at, limit ?? 50)
    const facts = new Map(listFacts(`id in (select value from json_each(?))`, JSON.stringify(page.items)).map(f => [f.id, f]))
    const doc = useDb().prepare('select id, name, title, version from documents where id = ? and project_id = ?')
    type D = { id: string, name: string, title: string, version: number }
    return reply({ total: page.total, next_cursor: page.next_cursor, facts: page.items.map(id => ({
      fact_id: id, statement: facts.get(id)?.statement, state: byFact.get(id),
      citations: cites.filter(c => c.fact_id === id).map((c) => {
        const old = doc.get(c.document_id, pid()) as D
        const latest = doc.get(c.latest_id, pid()) as D
        return { evidence_id: c.evidence_id, state: c.state, quote: c.quote, file: latest.name, title: latest.title,
          cites: { document_id: old.id, version: old.version, line: c.start_line }, latest: { document_id: latest.id, version: latest.version },
          ...(c.to ? { now_at_line: c.to.start_line, passage_id: c.to.passage_id } : { found_in_latest: c.count }) }
      }),
    })) })
  })

  server.registerTool('sb_list_tasks', {
    title: 'Re-review tasks',
    description: 'Re-review tasks: one per scene in an applied change\'s impact, with the passage to re-read, the change that caused it, the dependency path and who it is assigned to. Default: active (open and in progress). Read-only. Paginated. Example: {"status": "active"}',
    inputSchema: { status: z.enum(TASK_FILTERS).default('active').optional(), limit: z.number().int().min(1).max(100).default(50).optional(), cursor },
    annotations: read,
  }, ({ status, limit, cursor: at }) => {
    const s = status ?? 'active'
    const rows = s === 'all' ? listTasks() : s === 'active' ? listTasks(`t.status in ('open', 'in_progress')`) : listTasks('t.status = ?', s)
    const page = paginate(rows, at, limit ?? 50)
    return reply({ status_filter: s, total: page.total, next_cursor: page.next_cursor, tasks: page.items.map(t => ({
      id: t.id, status: t.status, scene: { document_id: t.document_id, title: t.document_title, version: t.document_version },
      passage_id: t.passage_id, line: t.start_line, quote: t.quote,
      change: { id: t.change_id, statement: t.change_statement, status: t.change_status }, why: t.rationale, path: t.path_labels, hops: t.hop_count,
      assignee: t.assignee_name, due_date: t.due_date, comment: t.comment || null, updated_at: t.updated_at,
    })) })
  })

  server.registerTool('sb_propose_candidate', {
    title: 'Propose a candidate fact (pending)',
    description: 'Propose a NEW fact for human review. It becomes a pending candidate in the review queue, marked as proposed by this agent; it is NOT canon until a person accepts it. The quote must appear verbatim in one passage (paragraph) of the latest version of an imported document, or the proposal is refused and nothing is stored; curly vs straight quotes, dash style, line breaks and Markdown * _ marks may differ, and the source\'s exact characters are stored. Requires editor role or above. '
      + 'Example: {"document": "S03-the-kettle-and-coal.md", "quote": "<exact words from sb_read_document>", "statement": "Odo keeps the inn\'s ledger.", "kind": "claim", "subject": "Odo", "predicate": "keeps", "object": "the inn\'s ledger"}',
    inputSchema: {
      document: z.string().min(1).max(200).describe('Imported document id, or its file name when only one document has that name. The latest version is cited.'),
      quote: z.string().min(1).max(2000).describe('Exact text copied from the document'),
      statement: z.string().min(1).max(500).describe('The fact as one plain sentence'),
      kind: z.enum(FACT_KINDS),
      subject: z.string().min(1).max(200), predicate: z.string().min(1).max(80),
      object: z.string().max(200).optional(), value: z.string().max(200).optional(),
      time_from: z.string().max(20).optional().describe(STORY_TIME),
      time_to: z.string().max(20).optional(),
      time_precision: z.enum(['exact', 'approximate']).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (p) => {
    const a = access()
    const db = useDb()
    if (!atLeast(a.role, 'editor')) return refuse('FORBIDDEN', `This token acts as ${a.user.name} (${a.role}); viewers cannot propose candidates.`)
    // Facts cite the latest version only, whichever version's id was passed.
    const doc = findDocument(p.document).latest
    const match = findQuotePassage(db.prepare('select id, text from passages where document_id = ? order by ordinal').all(doc.id) as { id: string, text: string }[], p.quote)
    if (!match) {
      audit('agent.proposal_refused', 'token', token.id, { token_name: token.name, code: 'QUOTE_NOT_VERBATIM', statement: p.statement })
      return refuse('QUOTE_NOT_VERBATIM', `The quote was blank, too short (min ${MIN_QUOTE_CHARS} characters) or not found in one paragraph of the latest version of ${doc.name} (only curly quotes, dashes, line breaks and Markdown * _ marks may differ). Copy the exact text from sb_read_document; nothing was stored.`)
    }
    const { from: tFrom, to: tTo, bad, day } = parseStoryRange(p.time_from, p.time_to)
    if (bad) return refuse('BAD_INPUT', `${STORY_TIME}.`)
    if (tFrom != null && tTo != null && tTo < tFrom) return refuse('BAD_INPUT', 'time_to is before time_from.')
    const dup = db.prepare(`select id, status from facts where project_id = ? and status in ('pending', 'canon') and lower(statement) = lower(?)`).get(pid(), p.statement.trim()) as { id: string, status: string } | undefined
    if (dup) return refuse('DUPLICATE', `The same statement already exists as ${dup.status} fact ${dup.id}.`)

    const id = newId('fact')
    const precision = tFrom != null || tTo != null ? (p.time_precision ?? 'exact') : null
    tx(() => {
      db.prepare(`insert into facts (id, kind, subject, predicate, object, value, statement, t_from, t_to, time_label, precision, status, confidence, origin, model_id,
        created_at, project_id, proposed_by_token, proposed_by_user) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', null, 'agent:mcp', null, ?, ?, ?, ?)`)
        .run(id, p.kind, p.subject.trim(), p.predicate.trim(), p.object?.trim() || null, p.value?.trim() || null, p.statement.trim(), tFrom, tTo,
          timeLabel(tFrom, tTo, precision, day), precision, now(), pid(), token.id, a.user.id)
      db.prepare('insert into evidence (id, fact_id, document_id, passage_id, quote, verified, project_id) values (?, ?, ?, ?, ?, 1, ?)')
        .run(newId('ev'), id, doc.id, match.passage.id, match.quote, pid())
      audit('candidate.created', 'fact', id, { via: 'mcp', token_id: token.id, token_name: token.name, document_id: doc.id, quote_verified: true })
    })
    return reply({ status: 'pending', fact_id: id, cites: { document_id: doc.id, file: doc.name, version: doc.version, passage_id: match.passage.id, quote: match.quote },
      message: 'Candidate created and waiting in the review queue. It is not canon until a person accepts it.' })
  })

  // Prompts: ready-made tasks a client can offer its user. They only steer the agent; the tools above do the work.
  server.registerPrompt('brief-entity', {
    title: 'Brief me on an entity',
    description: 'A canon briefing on one character, place, item or faction, with every claim cited.',
    argsSchema: { entity: z.string().min(1).max(200).describe('Entity name or id') },
  }, ({ entity }) => ({ messages: [{ role: 'user', content: { type: 'text', text:
    `Brief me on "${entity}" from Story Bible. Call sb_get_entity (and sb_get_timeline with that entity if it has timed facts). `
    + 'Write: who/what it is, key canon facts, relationships, timeline, open conflicts. Cite every canon claim as (file, lines) from the evidence. '
    + 'Keep the editorial wiki text (summary, fields, notes) in a separate section labelled "Team notes (not canon)". If canon has nothing, say "unknown"; never fill gaps yourself.' } }] }))

  server.registerPrompt('continuity-check-scene', {
    title: 'Continuity-check a scene',
    description: 'Read a scene or draft and check what it states against accepted canon, without storing anything.',
    argsSchema: { document: z.string().min(1).max(200).describe('Document id or file name') },
  }, ({ document }) => ({ messages: [{ role: 'user', content: { type: 'text', text:
    `Continuity-check "${document}" against Story Bible canon. Read it with sb_read_document (page through next_cursor). `
    + 'List the checkable claims it makes: who is where and when (predicate "located_at", object = the place, story times like "D2 14:30"), relationships with their times, travel. '
    + 'Run them through sb_check_facts in one call and use sb_get_entity / sb_get_context_pack for anything else. '
    + 'Report each possible conflict with the passage lines and the canon fact it clashes with (quote + file + lines), and say which claims canon cannot confirm ("unknown"). '
    + 'Do not propose candidates unless I ask; a person decides what becomes canon.' } }] }))

  return server
}
