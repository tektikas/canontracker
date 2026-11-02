import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

// Story Bible over MCP. Reads are accepted canon only; the single write creates a PENDING candidate for a human to review.
const reply = (data: unknown, isError = false) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }], ...(isError ? { isError: true } : {}) })
const refuse = (code: string, message: string) => reply({ error: { code, message } }, true)
const UNKNOWN = 'Unknown: accepted canon has nothing on this. Do not assume an answer; ask a human or propose a candidate with a source quote.'

type FullFact = ReturnType<typeof listFacts>[number]

function present(f: FullFact) {
  return {
    id: f.id, statement: f.statement, kind: f.kind, subject: f.subject, predicate: f.predicate, object: f.object, value: f.value,
    time: f.time_label, version: f.version, origin: f.origin, // 'sample' = preloaded with a sample project, no person decided it
    evidence: f.evidence.filter(e => e.verified).map(e => ({
      quote: e.quote, document_id: e.document_id, file: e.document_filename, folder: e.document_folder, title: e.document_title, document_version: e.document_version,
      lines: e.start_line == null ? null : `${e.start_line}-${e.end_line}`, passage_id: e.passage_id, support: e.support, stale: e.latest_version > e.document_version,
    })),
  }
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

export function buildMcpServer(token: { id: string, name: string }) {
  const server = new McpServer({ name: 'story-bible', version: '1.0.0' }, {
    instructions: 'Story Bible holds a game studio\'s approved narrative canon with verbatim source quotes. Read canon with sb_get_context_pack / sb_search_facts before writing lore. '
      + 'If canon has nothing, say so; never invent facts, ids or quotes. You cannot change canon: sb_propose_candidate adds a pending candidate that a person reviews in the web app.',
  })
  const read = { readOnlyHint: true, openWorldHint: false }

  server.registerTool('sb_list_projects', {
    description: 'The project this token is scoped to (one token = one project), your role in it, and counts of canon facts, pending candidates and open conflicts. Call first to confirm what you are connected to.',
    annotations: read,
  }, () => {
    const { project, studio, role, user } = access()
    const n = (sql: string) => (useDb().prepare(sql).get(pid()) as { n: number }).n
    return reply({
      projects: [{ id: project.id, name: project.name, studio: studio.name, your_role: role, acting_for: user.name,
        canon_facts: n(`select count(*) n from facts where project_id = ? and status = 'canon'`),
        pending_candidates: n(`select count(*) n from facts where project_id = ? and status = 'pending'`),
        open_conflicts: n(`select count(*) n from conflicts where project_id = ? and status = 'open'`) }],
      can_propose: atLeast(role, 'editor'),
    })
  })

  server.registerTool('sb_get_context_pack', {
    description: 'Compact briefing on an entity (character, place, faction, rule) or topic: the accepted canon facts about it, each with verbatim source quotes and document ids/lines. Use before writing or editing lore. Returns status "unknown" when canon has nothing.',
    inputSchema: { topic: z.string().min(1).describe('Entity name or topic, e.g. "Mara Venn" or "tide bell rules"'), limit: z.number().int().min(1).max(40).default(15).optional() },
    annotations: read,
  }, ({ topic, limit }) => {
    // A topic that names an entity page reads canon by that page's identity: its analysis name plus names merged into it (never titles or hand aliases).
    const page = listEntities().find(e => namesOf(e).some(n => normName(n) === normName(topic)))
    const idn = page ? new Set([analysisName(page), ...mergedFrom(page)].map(normName)) : null
    const byIdentity = idn ? listFacts('status = ?', 'canon').filter(f => idn.has(normName(f.subject)) || (f.object != null && idn.has(normName(f.object)))) : []
    const facts = [...new Map([...byIdentity, ...searchCanon(topic, limit ?? 15)].map(f => [f.id, f])).values()].slice(0, limit ?? 15)
    if (!facts.length) return reply({ status: 'unknown', topic, message: UNKNOWN, facts: [] })
    const ids = new Set(facts.map(f => f.id))
    const conflicts = (useDb().prepare(`select id, rule, left_fact_id, right_fact_id, rationale from conflicts where project_id = ? and status = 'open'`).all(pid()) as
      { id: string, rule: string, left_fact_id: string, right_fact_id: string, rationale: string }[]).filter(c => ids.has(c.left_fact_id) || ids.has(c.right_fact_id))
    return reply({ status: 'ok', topic, ...(page && { entity: { id: page.id, name: page.name, analysis_name: analysisName(page), merged_names: mergedFrom(page) } }), scope: 'accepted canon only', facts: facts.map(present), open_conflicts_touching_these: conflicts })
  })

  server.registerTool('sb_search_facts', {
    description: 'Keyword search over accepted canon facts (statement, subject, object). Returns compact hits with ids; use sb_get_fact for full evidence. Empty result means canon has nothing on it ("unknown"), not that it is false.',
    inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(50).default(10).optional() },
    annotations: read,
  }, ({ query, limit }) => {
    const hits = searchCanon(query, limit ?? 10)
    return reply({ status: hits.length ? 'ok' : 'unknown', query, ...(hits.length ? {} : { message: UNKNOWN }),
      facts: hits.map(f => ({ id: f.id, statement: f.statement, subject: f.subject, predicate: f.predicate, object: f.object, time: f.time_label, origin: f.origin })) })
  })

  server.registerTool('sb_get_fact', {
    description: 'One fact by id with status and all its evidence (verbatim quote, document id, file, line range). Accepted canon only; pending, rejected and superseded facts are refused (NOT_CANON).',
    inputSchema: { fact_id: z.string() },
    annotations: read,
  }, ({ fact_id }) => {
    const [f] = listFacts('id = ?', fact_id)
    if (!f) return refuse('NOT_FOUND', `No fact ${fact_id} in this project.`)
    if (f.status !== 'canon') return refuse('NOT_CANON', `Fact ${fact_id} is ${f.status}, not accepted canon. Only accepted canon is readable.`)
    return reply({ ...present(f), status: f.status, origin: f.origin, supersedes_id: f.supersedes_id,
      ...(f.agent_name ? { proposed_by_agent: f.agent_name, proposed_for: f.proposed_by_name } : {}) })
  })

  server.registerTool('sb_list_conflicts', {
    description: 'Possible canon conflicts found by the rule checks (time/place overlap, travel time, relationship after end, world-rule violations). These are candidates for a human to judge, not verdicts. Default: open ones.',
    inputSchema: { status: z.enum(['open', 'confirmed', 'false_positive', 'uncertain', 'all']).default('open').optional() },
    annotations: read,
  }, ({ status }) => {
    const s = status ?? 'open'
    const rows = useDb().prepare(`select * from conflicts where project_id = ? ${s === 'all' ? '' : 'and status = ?'} order by rowid`)
      .all(...(s === 'all' ? [pid()] : [pid(), s])) as unknown as ConflictRow[]
    const stmt = (id: string) => (useDb().prepare('select id, statement from facts where id = ?').get(id) as { id: string, statement: string })
    return reply({ status_filter: s, count: rows.length, conflicts: rows.map(c => ({
      id: c.id, rule: c.rule, severity: c.severity, origin: c.origin === 'model' ? 'model-suggested' : 'rule', status: c.status, confidence: c.confidence,
      rationale: c.rationale, left: stmt(c.left_fact_id), right: stmt(c.right_fact_id),
    })) })
  })

  server.registerTool('sb_get_impact', {
    description: 'What a change would touch: accepted facts and scenes within max 2 hops of a canon fact (fact_id), or the stored impact of an existing change proposal (change_id). Pass exactly one. Each item has path, evidence ids and rationale. An empty list means "no impact found within accepted canon, max 2 hops", not a guarantee of none.',
    inputSchema: { fact_id: z.string().optional(), change_id: z.string().optional() },
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
      ...(items.length ? {} : { note: 'No impact found within accepted canon, max 2 hops.' }) })
  })

  server.registerTool('sb_propose_candidate', {
    description: 'Propose a NEW fact for human review. It becomes a pending candidate in the review queue, marked as proposed by this agent; it is NOT canon until a person accepts it. The quote must appear verbatim in one passage (paragraph) of an imported document, or the proposal is refused and nothing is stored; curly vs straight quotes, dash style, line breaks and Markdown * _ marks may differ, and the source\'s exact characters are stored. Requires editor role or above.',
    inputSchema: {
      document: z.string().describe('Imported document id, or its file name (latest version) when only one document has that name'),
      quote: z.string().min(1).describe('Exact text copied from the document'),
      statement: z.string().min(1).describe('The fact as one plain sentence'),
      kind: z.enum(['character', 'claim', 'event', 'relationship', 'rule']),
      subject: z.string().min(1), predicate: z.string().min(1),
      object: z.string().optional(), value: z.string().optional(),
      time_from: z.string().optional().describe('Story time "D<day> HH:MM" or day-only "D<day>" (whole day); day may be 0 or negative for before D1, e.g. "D2 14:30", "D-3650"'),
      time_to: z.string().optional(),
      time_precision: z.enum(['exact', 'approximate']).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (p) => {
    const a = access()
    const db = useDb()
    const denied = (code: string, message: string) => {
      audit('agent.proposal_refused', 'token', token.id, { token_name: token.name, code, statement: p.statement })
      return refuse(code, message)
    }
    if (!atLeast(a.role, 'editor')) return refuse('FORBIDDEN', `This token acts as ${a.user.name} (${a.role}); viewers cannot propose candidates.`)
    // By id, else by file name: the latest version of the one document with that name (two folders can hold the same name).
    const named = db.prepare('select distinct filename from documents where project_id = ? and name = ?').all(pid(), p.document) as { filename: string }[]
    if (named.length > 1) return refuse('DOCUMENT_AMBIGUOUS', `${named.length} documents are called "${p.document}" (in different folders). Pass the document_id instead.`)
    const doc = (db.prepare('select id, name from documents where project_id = ? and id = ?').get(pid(), p.document)
      ?? db.prepare('select id, name from documents where project_id = ? and filename = ? order by version desc').get(pid(), named[0]?.filename ?? '')) as { id: string, name: string } | undefined
    if (!doc) return refuse('DOCUMENT_NOT_FOUND', `No imported document "${p.document}" in this project. Candidates must cite an imported document.`)
    const match = findQuotePassage(db.prepare('select id, text from passages where document_id = ? order by ordinal').all(doc.id) as { id: string, text: string }[], p.quote)
    if (!match) return denied('QUOTE_NOT_VERBATIM', `The quote was blank, too short (min ${MIN_QUOTE_CHARS} characters) or not found in one paragraph of ${doc.name} (only curly quotes, dashes, line breaks and Markdown * _ marks may differ). Copy the exact text; nothing was stored.`)
    const { from: tFrom, to: tTo, bad, day } = parseStoryRange(p.time_from, p.time_to)
    if (bad) return refuse('BAD_TIME', 'Story time must look like "D2 14:30" or "D-3650" (day 0 and earlier are allowed).')
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
    return reply({ status: 'pending', fact_id: id, message: 'Candidate created and waiting in the review queue. It is not canon until a person accepts it.' })
  })

  return server
}
