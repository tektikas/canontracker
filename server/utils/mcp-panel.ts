import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { SECTION_KEYS } from '../../shared/utils/bible'
import type { BibleSection } from '../../shared/utils/bible'
import { TYPE_ICONS } from '../../shared/utils/entities'
import { candidateFingerprint } from '../../shared/utils/review'

// The panel over MCP: every project-level job a person does in the web app, as tools grouped by area with an `action`.
// Each action calls the web app's own route in-process (panelCall), so the checks, limits, throttles, transactions and audit
// events are the ones the panel runs, with the token owner's live role (the project guard blocks viewer writes as usual).
// Level: read (any token), propose (any token: proposals and model runs, nothing becomes canon), full (a full-access token
// only: decisions and editorial writes, made as its owner and audited via: 'mcp' with the token).
// Not here, on purpose: account routes (sign-up, log-in, password, profile), studios, API tokens (an agent never mints one),
// invite accept, demo load (a destructive reset), audio uploads and dictation (audio does not fit a tool call), binary
// downloads (portraits, images, audio, the original .docx, EPUB/zip) and OAuth.

type Level = 'read' | 'propose' | 'full'
type Args = Record<string, any>
interface Action { level: Level | ((a: Args) => Level), run: (a: Args) => unknown }

const id = z.string().regex(/^[\w-]{1,80}$/, 'an id like fact_0123abcd')
const ids = z.array(id).min(1).max(500)
const limit = (max: number, def: number) => z.number().int().min(1).max(max).default(def).optional()
const STORY_TIME = 'Story time "D2 14:30" or a whole day "D2" (the day may be 0 or negative)'
const B64_MAX = 5_600_000 // characters of base64: a 4 MB image, or a 1 MB .docx with room to spare (the route's own limits still apply)

/** Calls one of the web app's own API routes in-process as the token's owner. The route sees the same Access the MCP request
 * has (event.context.mcpAccess, read by resolveAccess/requireUser), so it runs exactly as for that person in the panel. */
export async function panelCall(method: string, path: string, opts: { query?: Record<string, unknown>, body?: unknown, form?: FormData } = {}) {
  const headers: Record<string, string> = { accept: 'application/json' }
  let body: Buffer | undefined
  if (opts.form) {
    const r = new Request('http://local/', { method: 'POST', body: opts.form })
    body = Buffer.from(await r.arrayBuffer())
    headers['content-type'] = r.headers.get('content-type')!
  } else if (opts.body !== undefined) {
    body = Buffer.from(JSON.stringify(opts.body))
    headers['content-type'] = 'application/json'
  }
  const qs = new URLSearchParams(Object.entries(opts.query ?? {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString()
  const res = await useNitroApp().localFetch(`${path}${qs ? `?${qs}` : ''}`, { method, headers, body, context: { _platform: { mcpAccess: access() } } } as RequestInit)
  const text = await res.text()
  let data: any = text
  if ((res.headers.get('content-type') ?? '').includes('json')) try { data = JSON.parse(text) } catch {}
  if (!res.ok) {
    if (res.status >= 500) throw new McpToolError('INTERNAL', res.status === 502 && data?.message ? data.message : 'Story Bible failed on this call. Try again; if it keeps failing, tell the studio.')
    throw new McpToolError(MCP_H3_CODES[res.status] ?? 'BAD_INPUT', data?.message ?? `Refused (${res.status}).`, { reason: data?.statusMessage, ...(data?.data && { details: data.data }) })
  }
  return data
}

const need = (a: Args, ...keys: string[]) => {
  for (const k of keys) if (a[k] == null || a[k] === '') throw new McpToolError('BAD_INPUT', `${a.action} needs ${k}.`)
}
const pick = <T extends Record<string, any>>(o: T, ...keys: (keyof T)[]) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))
const enc = encodeURIComponent
// Ids the agent passes by name: documents (id or file name; the latest version unless a version is named) and entity pages.
const doc = (ref: string) => mcpDocument(ref).latest.id
const ent = (ref: string) => mcpEntity(ref).id
// Long text (exports) comes in pages of max_chars, cursor = the character to continue from.
function textPage(text: string, at: string | undefined, max = 40_000) {
  const from = Number(at ?? 0)
  return { total_chars: text.length, next_cursor: from + max < text.length ? String(from + max) : null, text: text.slice(from, from + max) }
}
const b64 = (s: string, what: string) => {
  const buf = Buffer.from(s, 'base64')
  if (!buf.length) throw new McpToolError('BAD_INPUT', `${what} is empty or not base64.`)
  return buf
}
const evidence = (e: Record<string, any>) => ({ evidence_id: e.id, quote: e.quote, verified: !!e.verified, document_id: e.document_id, file: e.document_filename,
  version: e.document_version, latest_version: e.latest_version, passage_id: e.passage_id, lines: e.start_line == null ? null : `${e.start_line}-${e.end_line}` })

export function registerPanelTools(server: McpServer, token: { id: string, name: string, level?: TokenLevel }) {
  function tool(name: string, title: string, description: string, schema: Record<string, z.ZodTypeAny>, actions: Record<string, Action>) {
    const levels = Object.values(actions).map(a => a.level)
    server.registerTool(name, {
      title, description, inputSchema: { action: z.enum(Object.keys(actions) as [string, ...string[]]), ...schema },
      annotations: { readOnlyHint: levels.every(l => l === 'read'), destructiveHint: levels.includes('full'), idempotentHint: false, openWorldHint: false },
    } as never, (async (a: Args) => {
      const act = actions[a.action]!
      const lvl = typeof act.level === 'function' ? act.level(a) : act.level
      if (lvl === 'full' && token.level !== 'full') {
        throw new McpToolError('FORBIDDEN', `${name} ${a.action} decides or edits as ${access().user.name}, so it needs a full-access token ("acts as you"). This token can read and propose only. A person can create a full-access token in Settings > Agents & API.`, { needed_level: 'full', token_level: token.level ?? 'propose' })
      }
      return mcpReply(await act.run(a))
    }) as never)
  }

  // ---------------------------------------------------------------- Review
  tool('sb_review', 'Review queue: decide candidates',
    'The Review queue. list (read): candidates by status (pending by default) with verified quotes, the AI critic\'s advice, merge renames and, for pending ones, the fingerprint accept_verified needs. '
    + 'add (to "review": propose; to "canon": full): a fact from a quote in the latest version of a document. critic (propose): ask the AI critic for advice on pending ids (advice only). '
    + 'accept / edit_accept / reject / accept_verified (full token, editor+): a canon decision made as the token\'s owner, shown as "via agent" in the app; only decide what your person asked you to. '
    + `Example: {"action": "accept", "fact_id": "fact_0123abcd4567ef89", "rationale": "Stated in S03, line 12."}`,
    {
      status: z.enum(['pending', 'canon', 'rejected', 'superseded']).default('pending').optional().describe('list: which facts'),
      fact_id: id.optional(), rationale: z.string().max(2000).optional().describe('Why (required to reject)'),
      corrected: z.object({ statement: z.string().max(500).optional(), subject: z.string().max(80).optional(), predicate: z.string().max(60).optional(),
        object: z.string().max(80).nullable().optional(), time_from: z.string().max(40).optional().describe(STORY_TIME), time_to: z.string().max(40).optional(),
        precision: z.enum(['exact', 'approximate']).optional() }).optional().describe('edit_accept: the fields to change'),
      items: z.array(z.object({ id, fingerprint: z.string().max(20_000) })).min(1).max(500).optional().describe('accept_verified: ids with the fingerprint list returned (critic_fingerprint when critic is true)'),
      critic: z.boolean().optional().describe('accept_verified: accept only what the AI critic keeps'),
      ids: ids.optional().describe('critic: pending candidate ids'),
      to: z.enum(['review', 'canon']).optional().describe('add: send to the review queue, or straight to canon (full)'),
      document: z.string().max(200).optional().describe('add: document id or file name (its latest version is cited)'),
      quote: z.string().max(2000).optional().describe('add: exact words from one paragraph of the document'),
      passage_id: id.optional(), statement: z.string().max(500).optional(),
      kind: z.enum(['character', 'location', 'relationship', 'event', 'rule', 'claim']).optional(),
      subject: z.string().max(80).optional(), predicate: z.string().max(60).optional(), object: z.string().max(80).optional(), value: z.string().max(200).optional(),
      time_from: z.string().max(40).optional().describe(STORY_TIME), time_to: z.string().max(40).optional(), precision: z.enum(['exact', 'approximate']).optional(),
      continuity_id: id.optional().describe('add: a "new" finding of this continuity check (to review only)'),
      limit: limit(100, 20), cursor: mcpCursor,
    }, {
      list: { level: 'read', run: async (a) => {
        const status = a.status ?? 'pending'
        const page = mcpPage(await panelCall('GET', '/api/facts', { query: { status } }) as Record<string, any>[], a.cursor, a.limit ?? 20)
        return { status, total: page.total, next_cursor: page.next_cursor, facts: page.items.map(f => ({
          id: f.id, statement: f.statement, kind: f.kind, subject: f.subject, predicate: f.predicate, object: f.object, value: f.value, time: f.time_label, origin: f.origin,
          evidence: f.evidence.map(evidence),
          ...(f.agent_name && { proposed_by_agent: f.agent_name, proposed_for: f.proposed_by_name }),
          ...(f.decided_by_name && { decided_by: f.decided_by_name, ...(f.decided_via && { via_agent: f.decided_via }), rationale: f.rationale }),
          ...(status === 'pending' && { renamed_on_accept: f.identity, ai_critic: f.critic, fingerprint: candidateFingerprint(f as never), critic_fingerprint: candidateFingerprint(f as never, true) }),
        })) }
      } },
      add: { level: a => (a.to === 'canon' ? 'full' : 'propose'), run: (a) => {
        need(a, 'to', 'document', 'quote', 'statement', 'subject', 'predicate')
        return panelCall('POST', '/api/facts', { body: { ...pick(a, 'to', 'quote', 'passage_id', 'statement', 'kind', 'subject', 'predicate', 'object', 'value', 'time_from', 'time_to', 'precision', 'continuity_id'), document_id: doc(a.document) } })
      } },
      critic: { level: 'propose', run: (a) => (need(a, 'ids'), panelCall('POST', '/api/facts/critic', { body: { ids: a.ids } })) },
      accept: { level: 'full', run: (a) => (need(a, 'fact_id'), panelCall('POST', `/api/facts/${enc(a.fact_id)}/review`, { body: { decision: 'accept', rationale: a.rationale } })) },
      edit_accept: { level: 'full', run: (a) => (need(a, 'fact_id', 'corrected'), panelCall('POST', `/api/facts/${enc(a.fact_id)}/review`, { body: { decision: 'correct_and_accept', corrected: a.corrected, rationale: a.rationale } })) },
      reject: { level: 'full', run: (a) => (need(a, 'fact_id', 'rationale'), panelCall('POST', `/api/facts/${enc(a.fact_id)}/review`, { body: { decision: 'reject', rationale: a.rationale } })) },
      accept_verified: { level: 'full', run: (a) => (need(a, 'items'), panelCall('POST', '/api/facts/accept-verified', { body: { items: a.items, critic: a.critic === true } })) },
    })

  tool('sb_recheck', 'Re-check citations after a new version',
    'Settle canon citations that point at an older version of their source (sb_list_recheck lists them). confirm (full): facts whose quote reads the same, once, in the latest version now cite it. '
    + 'keep (full): outdated citations stay on their old version, marked checked against the latest. Canon statements never change. Example: {"action": "confirm", "fact_ids": ["fact_0123abcd4567ef89"]}',
    { fact_ids: ids.optional().describe('confirm'), evidence_ids: ids.optional().describe('keep: citation ids from sb_list_recheck') }, {
      confirm: { level: 'full', run: (a) => (need(a, 'fact_ids'), panelCall('POST', '/api/facts/recheck', { body: { action: 'confirm', fact_ids: a.fact_ids } })) },
      keep: { level: 'full', run: (a) => (need(a, 'evidence_ids'), panelCall('POST', '/api/facts/recheck', { body: { action: 'keep', evidence_ids: a.evidence_ids } })) },
    })

  // ---------------------------------------------------------------- Changes and conflicts
  tool('sb_change', 'Change proposals',
    'Proposals to change a canon fact, kept apart from conflicts and impact. list (read). propose (propose): new wording + why; impact (max 2 hops) is analysed at once, canon is untouched. '
    + 'analyze (propose): re-run impact after a merge made it stale. decide (full, editor+): accept applies a new canon version (the old one is kept as superseded) and opens re-review tasks; reject closes it. '
    + 'revert (full): restore the wording before an applied change. export (read): the impact manifest as json, csv or md. Example: {"action": "propose", "fact_id": "fact_0123abcd4567ef89", "proposed_statement": "…", "rationale": "…"}',
    {
      change_id: id.optional(), fact_id: id.optional().describe('propose: the canon fact to change'),
      proposed_statement: z.string().max(500).optional(), rationale: z.string().max(2000).optional(),
      decision: z.enum(['accept', 'reject']).optional(), format: z.enum(['json', 'csv', 'md']).default('json').optional(),
      status: z.enum(['analyzing', 'ready_for_review', 'applied', 'rejected', 'reverted', 'all']).default('all').optional(), limit: limit(100, 20), cursor: mcpCursor,
    }, {
      list: { level: 'read', run: async (a) => {
        const rows = (await panelCall('GET', '/api/changes') as Record<string, any>[]).filter(c => (a.status ?? 'all') === 'all' || c.status === a.status)
        const page = mcpPage(rows, a.cursor, a.limit ?? 20)
        return { total: page.total, next_cursor: page.next_cursor, changes: page.items.map(c => ({
          ...pick(c, 'id', 'status', 'target_fact_id', 'before_statement', 'proposed_statement', 'rationale', 'new_fact_id', 'created_at', 'decided_at', 'decision_rationale', 'reverted_at', 'revert_rationale'),
          impact_items: c.impact.length, impact_stale: c.impact_stale, decided_by: c.decided_by_name, decided_via_agent: c.decided_via, reverted_by: c.reverted_by_name, reverted_via_agent: c.reverted_via,
        })) }
      } },
      propose: { level: 'propose', run: (a) => (need(a, 'fact_id', 'proposed_statement', 'rationale'), panelCall('POST', '/api/changes', { body: { target_fact_id: a.fact_id, proposed_statement: a.proposed_statement, rationale: a.rationale } })) },
      analyze: { level: 'propose', run: (a) => (need(a, 'change_id'), panelCall('POST', `/api/changes/${enc(a.change_id)}/analyze`)) },
      decide: { level: 'full', run: (a) => (need(a, 'change_id', 'decision', 'rationale'), panelCall('POST', `/api/changes/${enc(a.change_id)}/decision`, { body: { decision: a.decision, rationale: a.rationale } })) },
      revert: { level: 'full', run: (a) => (need(a, 'change_id', 'rationale'), panelCall('POST', `/api/changes/${enc(a.change_id)}/revert`, { body: { rationale: a.rationale } })) },
      export: { level: 'read', run: async (a) => {
        need(a, 'change_id')
        const out = await panelCall('GET', `/api/changes/${enc(a.change_id)}/export`, { query: { format: a.format ?? 'json' } })
        return typeof out === 'string' ? { format: a.format, text: out } : out
      } },
    })

  tool('sb_conflict', 'Decide possible conflicts',
    'Possible conflicts (sb_list_conflicts lists them) are candidates for a person to judge, never verdicts. scan (propose): run the conflict rules over canon (and the AI world-rule check). '
    + 'decide (full, editor+): confirmed / false_positive / uncertain with a reason; it never edits canon (use sb_change). severity (full): hard or soft, with a reason. '
    + 'Example: {"action": "decide", "conflict_id": "cfl_0123abcd", "decision": "false_positive", "rationale": "Approximate times, different evenings."}',
    { conflict_id: id.optional(), decision: z.enum(['confirmed', 'false_positive', 'uncertain']).optional(), severity: z.enum(['hard', 'soft']).optional(), rationale: z.string().max(2000).optional() }, {
      scan: { level: 'propose', run: () => panelCall('POST', '/api/conflicts/scan') },
      decide: { level: 'full', run: (a) => (need(a, 'conflict_id', 'decision', 'rationale'), panelCall('POST', `/api/conflicts/${enc(a.conflict_id)}/decision`, { body: { decision: a.decision, rationale: a.rationale } })) },
      severity: { level: 'full', run: (a) => (need(a, 'conflict_id', 'severity', 'rationale'), panelCall('POST', `/api/conflicts/${enc(a.conflict_id)}/severity`, { body: { severity: a.severity, rationale: a.rationale } })) },
    })

  tool('sb_task', 'Update a re-review task',
    'Move a re-review task (sb_list_tasks lists them) along: status open / in_progress / done / wont_fix, assign it (a studio member\'s user id, or null), a due date (YYYY-MM-DD) or a comment. Full token. '
    + 'Example: {"action": "update", "task_id": "task_0123abcd", "status": "done", "comment": "Re-read; still consistent."}',
    { task_id: id.optional(), status: z.enum(['open', 'in_progress', 'done', 'wont_fix']).optional(), assignee_id: id.nullable().optional(), due_date: z.string().max(10).nullable().optional(), comment: z.string().max(4000).optional() }, {
      update: { level: 'full', run: (a) => (need(a, 'task_id'), panelCall('PATCH', `/api/tasks/${enc(a.task_id)}`, { body: pick(a, 'status', 'assignee_id', 'due_date', 'comment') })) },
    })

  // ---------------------------------------------------------------- Entities and the project
  tool('sb_entity', 'Edit entity pages',
    'Wiki pages (read them with sb_get_entity / sb_list_entities). The page text is editorial, never canon; a merge is an identity decision that re-points canon. All full-token, editor+, except merge with preview (read). '
    + 'create: name, type (a key from sb_project types), summary. update: name, type, summary, aliases, fields, notes. merge: this page (the duplicate) into another; preview: true shows what would move without doing it. '
    + 'delete: only when no canon or candidate names it. portrait_set: a PNG/JPEG/WebP as base64 (max 4 MB). portrait_remove. Example: {"action": "merge", "entity": "Salt Gate", "into": "Saltgate", "preview": true}',
    {
      entity: z.string().max(200).optional().describe('Entity id or name'), into: z.string().max(200).optional().describe('merge: the page to keep (id or name)'), preview: z.boolean().optional(),
      name: z.string().max(80).optional(), type: z.string().max(40).optional().describe('Entity type key, e.g. "character"'), summary: z.string().max(2000).optional(),
      aliases: z.array(z.string().max(80)).max(50).optional(), fields: z.record(z.string(), z.string().max(2000)).optional().describe('Medium fields by key'), notes: z.string().max(20000).optional(),
      image_base64: z.string().max(B64_MAX).optional(), filename: z.string().max(200).optional(),
    }, {
      create: { level: 'full', run: (a) => (need(a, 'name', 'type'), panelCall('POST', '/api/entities', { body: { name: a.name, kind: a.type, summary: a.summary } })) },
      update: { level: 'full', run: (a) => (need(a, 'entity'), panelCall('PATCH', `/api/entities/${ent(a.entity)}`, { body: { ...pick(a, 'name', 'summary', 'aliases', 'fields', 'notes'), ...(a.type && { kind: a.type }) } })) },
      merge: { level: a => (a.preview ? 'read' : 'full'), run: (a) => (need(a, 'entity', 'into'), panelCall('POST', `/api/entities/${ent(a.entity)}/merge`, { body: { into: ent(a.into), preview: a.preview === true } })) },
      delete: { level: 'full', run: (a) => (need(a, 'entity'), panelCall('DELETE', `/api/entities/${ent(a.entity)}`)) },
      portrait_set: { level: 'full', run: (a) => {
        need(a, 'entity', 'image_base64', 'filename')
        const form = new FormData()
        form.append('file', new Blob([b64(a.image_base64, 'image_base64')]), a.filename)
        return panelCall('POST', `/api/entities/${ent(a.entity)}/portrait`, { form })
      } },
      portrait_remove: { level: 'full', run: (a) => (need(a, 'entity'), panelCall('DELETE', `/api/entities/${ent(a.entity)}/portrait`)) },
    })

  tool('sb_project', 'Project settings and entity types',
    'get (read): the project (name, medium, art style, conflict severity defaults, research profile) and your role. update (full, studio admin+): any of name, medium (game | prose | screen), art_style, severity_defaults {RULE: hard|soft}, research_profile {field, period, place, legal_system, notes}. '
    + 'types (read): the entity types. type_create / type_update / type_delete (full, editor+): labels only; deleting a type in use needs move_to. Example: {"action": "update", "research_profile": {"period": "1890s", "place": "Lisbon"}}',
    {
      name: z.string().max(80).optional(), medium: z.enum(['game', 'prose', 'screen']).optional(), art_style: z.string().max(500).optional(),
      severity_defaults: z.record(z.string(), z.enum(['hard', 'soft'])).optional(),
      research_profile: z.object({ field: z.string().max(40).optional(), period: z.string().max(200).optional(), place: z.string().max(200).optional(), legal_system: z.string().max(200).optional(), notes: z.string().max(2000).optional() }).optional(),
      key: z.string().regex(/^[a-z0-9_]{1,40}$/).optional().describe('Entity type key'), one: z.string().max(40).optional().describe('Type name, singular'), many: z.string().max(40).optional(),
      color: z.string().max(20).optional(), icon: z.enum(TYPE_ICONS).optional(), move_to: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
    }, {
      get: { level: 'read', run: async () => {
        const p = await panelCall('GET', `/api/projects/${pid()}`)
        const { project } = access()
        return { ...p, settings: { name: project.name, medium: project.medium, art_style: project.art_style, severity_defaults: projectSeverities(project.severity_defaults), research_profile: JSON.parse(project.research_profile || '{}') } }
      } },
      update: { level: 'full', run: (a) => panelCall('PATCH', `/api/projects/${pid()}`, { body: pick(a, 'name', 'medium', 'art_style', 'severity_defaults', 'research_profile') }) },
      types: { level: 'read', run: () => panelCall('GET', '/api/entity-types') },
      type_create: { level: 'full', run: (a) => (need(a, 'one'), panelCall('POST', '/api/entity-types', { body: pick(a, 'one', 'many', 'color', 'icon') })) },
      type_update: { level: 'full', run: (a) => (need(a, 'key'), panelCall('PATCH', `/api/entity-types/${a.key}`, { body: pick(a, 'one', 'many', 'color', 'icon') })) },
      type_delete: { level: 'full', run: (a) => (need(a, 'key'), panelCall('DELETE', `/api/entity-types/${a.key}`, { query: { move_to: a.move_to } })) },
    })

  tool('sb_team', 'Studio members and invites',
    'list (read): the studio\'s members and roles (open invite links for admins). set_role / remove (full, studio admin+; only owners touch owners, a studio keeps one owner). '
    + 'invite_create (full, admin+): a single-use link for a role, valid 1, 7 or 30 days; no email is sent. invite_revoke (full, admin+). Example: {"action": "invite_create", "role": "editor", "days": 7}',
    { user_id: id.optional(), role: z.enum(['viewer', 'editor', 'admin', 'owner']).optional(), days: z.union([z.literal(1), z.literal(7), z.literal(30)]).optional(), invite_id: id.optional() }, {
      list: { level: 'read', run: () => panelCall('GET', '/api/team') },
      set_role: { level: 'full', run: (a) => (need(a, 'user_id', 'role'), panelCall('PATCH', `/api/team/${enc(a.user_id)}`, { body: { role: a.role } })) },
      remove: { level: 'full', run: (a) => (need(a, 'user_id'), panelCall('DELETE', `/api/team/${enc(a.user_id)}`)) },
      invite_create: { level: 'full', run: (a) => (need(a, 'role'), panelCall('POST', '/api/team/invites', { body: { role: a.role, days: a.days ?? 7 } })) },
      invite_revoke: { level: 'full', run: (a) => (need(a, 'invite_id'), panelCall('DELETE', `/api/team/invites/${enc(a.invite_id)}`)) },
    })

  // ---------------------------------------------------------------- Sources
  tool('sb_document', 'Import, write and inspect documents',
    'Source documents are read-only once imported; a change is a new version. import (full, editor+): text (.md/.txt) or a Word file as docx_base64 (max 1 MB); same file name = next version, same text = skipped; extraction runs on import. '
    + 'write (full): save new text as a new version of a document (or a new document without one), like Save to story. extract (propose): run extraction again (pending candidates only). '
    + 'history / diff (read): versions, and what changed from one version to another with the canon citing changed passages. transcribe (full): a recording\'s stored audio again. script (read) / script_link (full): a recording vs its script. '
    + 'Read the text with sb_read_document. Example: {"action": "import", "filename": "S29-the-ferry.md", "text": "# The ferry\\n\\nOdo waits at the Salt Gate."}',
    {
      document: z.string().max(200).optional().describe('Document id or file name'),
      filename: z.string().max(200).optional().describe('import: file name with .md, .txt or .docx'), text: z.string().max(1_000_000).optional(),
      docx_base64: z.string().max(B64_MAX).optional(), folder_id: id.optional().describe('import: Library folder for a new document'),
      title: z.string().max(120).optional(), kind: z.enum(DOCUMENT_KINDS).optional(), content: z.string().max(1_000_000).optional().describe('write: the full new text'),
      from_version: z.number().int().min(1).optional().describe('diff: the older version (default: the one before the latest)'), version: z.number().int().min(1).optional().describe('diff: the newer version (default latest)'),
      include_unchanged: z.boolean().optional().describe('diff: also list passages that read the same'),
      script_document: z.string().max(200).nullable().optional().describe('script_link: the script document (id or file name), null to unlink'),
    }, {
      import: { level: 'full', run: async (a) => {
        need(a, 'filename')
        if ((a.text == null) === (a.docx_base64 == null)) throw new McpToolError('BAD_INPUT', 'import needs exactly one of text or docx_base64.')
        const form = new FormData()
        if (a.folder_id) form.append('folder_id', a.folder_id)
        form.append('files', a.text != null ? new Blob([a.text], { type: 'text/markdown' }) : new Blob([b64(a.docx_base64, 'docx_base64')], { type: DOCX_MIME }), a.filename)
        const { results } = await panelCall('POST', '/api/documents', { form }) as { results: Record<string, any>[] }
        const r = results[0]!
        if (r.status === 'error') throw new McpToolError('BAD_INPUT', r.error, { reason: 'IMPORT_REFUSED', ...(r.code && { status: r.code }) })
        return r
      } },
      write: { level: 'full', run: async (a) => {
        need(a, 'content')
        const target = a.document ? mcpDocument(a.document).latest : null
        if (!target) need(a, 'title')
        // The person's own unsaved draft of this document stays theirs: never overwritten by an agent.
        const mine = await panelCall('GET', '/api/drafts') as { id: string, filename: string | null }[]
        if (target && mine.some(d => d.filename === target.filename)) throw new McpToolError('BAD_INPUT', `${access().user.name} has an unsaved draft of this document in the web app. Save or discard it first (sb_draft).`)
        const draft = await panelCall('POST', '/api/drafts', { body: { ...(target && { document_id: target.id }), ...pick(a, 'title', 'kind', 'content') } }) as { id: string }
        try {
          await panelCall('PUT', `/api/drafts/${draft.id}`, { body: pick(a, 'title', 'kind', 'content') })
          return await panelCall('POST', `/api/drafts/${draft.id}/save`)
        } catch (e) {
          await panelCall('DELETE', `/api/drafts/${draft.id}`).catch(() => {})
          throw e
        }
      } },
      extract: { level: 'propose', run: (a) => (need(a, 'document'), panelCall('POST', `/api/documents/${doc(a.document)}/extract`)) },
      history: { level: 'read', run: async (a) => {
        need(a, 'document')
        const d = await panelCall('GET', `/api/documents/${doc(a.document)}`)
        return { ...pick(d, 'id', 'title', 'name', 'kind', 'version', 'origin', 'imported_at', 'created_by_name', 'folder', 'tags', 'recording', 'original'), latest: d.latest, versions: d.versions,
          canon_and_pending_facts: d.facts.length, notes: d.notes.length }
      } },
      diff: { level: 'read', run: async (a) => {
        need(a, 'document')
        const to = mcpDocument(a.document, a.version).doc
        const from = mcpDocument(to.id, a.from_version ?? to.version - 1).doc
        const d = await panelCall('GET', `/api/documents/${to.id}/diff`, { query: { from: from.id } })
        return { ...d, rows: a.include_unchanged ? d.rows : d.rows.filter((r: { op: string }) => r.op !== 'same') }
      } },
      transcribe: { level: 'full', run: (a) => (need(a, 'document'), panelCall('POST', `/api/documents/${doc(a.document)}/transcribe`)) },
      script: { level: 'read', run: (a) => (need(a, 'document'), panelCall('GET', `/api/documents/${mcpDocument(a.document).doc.id}/script`)) },
      script_link: { level: 'full', run: (a) => (need(a, 'document'), panelCall('POST', `/api/documents/${doc(a.document)}/script`, { body: { script_document_id: a.script_document ? doc(a.script_document) : null } })) },
    })

  tool('sb_draft', 'Your private drafts',
    'Drafts in /write are private to the token\'s owner until saved. list / get (read). create (full): a new draft, or with document an edit of that document starting from its latest text. update (full): title, kind, content. '
    + 'save (full): Save to story, a new read-only document version (overwrite_base: the latest version id, when the draft started from an older one). delete (full). Example: {"action": "create", "title": "The ferry", "content": "Odo waits at the Salt Gate."}',
    {
      draft_id: id.optional(), document: z.string().max(200).optional(), title: z.string().max(120).optional(), kind: z.enum(DOCUMENT_KINDS).optional(),
      content: z.string().max(1_000_000).optional(), overwrite_base: id.optional(),
    }, {
      list: { level: 'read', run: () => panelCall('GET', '/api/drafts') },
      get: { level: 'read', run: (a) => (need(a, 'draft_id'), panelCall('GET', `/api/drafts/${enc(a.draft_id)}`)) },
      create: { level: 'full', run: (a) => panelCall('POST', '/api/drafts', { body: { ...(a.document && { document_id: doc(a.document) }), ...pick(a, 'title', 'kind', 'content') } }) },
      update: { level: 'full', run: (a) => (need(a, 'draft_id'), panelCall('PUT', `/api/drafts/${enc(a.draft_id)}`, { body: pick(a, 'title', 'kind', 'content') })) },
      save: { level: 'full', run: (a) => (need(a, 'draft_id'), panelCall('POST', `/api/drafts/${enc(a.draft_id)}/save`, { body: pick(a, 'overwrite_base') })) },
      delete: { level: 'full', run: (a) => (need(a, 'draft_id'), panelCall('DELETE', `/api/drafts/${enc(a.draft_id)}`)) },
    })

  tool('sb_note', 'Notes in the margin',
    'Editorial notes pinned to a passage (never canon): open → ready → done. list (read, filter by status or document). create (full, editor+): body plus the quoted words (or a passage id) in a document. update (full): status or body. '
    + 'Example: {"action": "create", "document": "S03-the-kettle-and-coal.md", "quote": "the kettle never cools", "body": "Check against the Ember Well rule."}',
    {
      note_id: id.optional(), document: z.string().max(200).optional(), quote: z.string().max(2000).optional(), passage_id: id.optional(), body: z.string().max(4000).optional(),
      status: z.enum(['open', 'ready', 'done']).optional(), limit: limit(200, 50), cursor: mcpCursor,
    }, {
      list: { level: 'read', run: async (a) => {
        const file = a.document ? mcpDocument(a.document).latest.filename : null
        const rows = (await panelCall('GET', '/api/notes') as Record<string, any>[]).filter(n => (!a.status || n.status === a.status) && (!file || n.filename === file))
        const page = mcpPage(rows, a.cursor, a.limit ?? 50)
        return { total: page.total, next_cursor: page.next_cursor, notes: page.items.map(n => pick(n, 'id', 'status', 'body', 'quote', 'document_id', 'document_title', 'document_version', 'passage_id', 'start_line', 'created_by_name', 'created_at', 'updated_at')) }
      } },
      create: { level: 'full', run: (a) => (need(a, 'document', 'body'), panelCall('POST', '/api/notes', { body: { document_id: doc(a.document), ...pick(a, 'quote', 'passage_id', 'body') } })) },
      update: { level: 'full', run: (a) => (need(a, 'note_id'), panelCall('PATCH', `/api/notes/${enc(a.note_id)}`, { body: pick(a, 'status', 'body') })) },
    })

  tool('sb_library', 'Library folders, tags and labels',
    'Folders (two levels), tags and document labels: editorial, never the text or its hash. get (read): folders, tags, colours, kinds. folder_create / folder_rename / folder_delete (documents move up, nothing is deleted), '
    + 'tag_create / tag_update / tag_delete, organise (move to a folder (null = root), add/remove tags, set kind, rename one document): all full, editor+. '
    + 'Example: {"action": "organise", "documents": ["S03-the-kettle-and-coal.md"], "folder_id": "fld_0123abcd", "add_tags": ["tag_0123abcd"]}',
    {
      folder_id: id.nullable().optional(), parent_id: id.optional(), tag_id: id.optional(), name: z.string().max(60).optional(), color: z.enum(['accent', 'good', 'warn', 'bad', 'pencil']).optional(),
      documents: z.array(z.string().max(200)).min(1).max(200).optional().describe('organise: document ids or file names'),
      add_tags: z.array(id).max(50).optional(), remove_tags: z.array(id).max(50).optional(), kind: z.enum(DOCUMENT_KINDS).optional(), title: z.string().max(120).optional(),
    }, {
      get: { level: 'read', run: () => panelCall('GET', '/api/library') },
      folder_create: { level: 'full', run: (a) => (need(a, 'name'), panelCall('POST', '/api/library/folders', { body: pick(a, 'name', 'parent_id') })) },
      folder_rename: { level: 'full', run: (a) => (need(a, 'folder_id', 'name'), panelCall('PATCH', `/api/library/folders/${enc(a.folder_id)}`, { body: { name: a.name } })) },
      folder_delete: { level: 'full', run: (a) => (need(a, 'folder_id'), panelCall('DELETE', `/api/library/folders/${enc(a.folder_id)}`)) },
      tag_create: { level: 'full', run: (a) => (need(a, 'name'), panelCall('POST', '/api/library/tags', { body: pick(a, 'name', 'color') })) },
      tag_update: { level: 'full', run: (a) => (need(a, 'tag_id'), panelCall('PATCH', `/api/library/tags/${enc(a.tag_id)}`, { body: pick(a, 'name', 'color') })) },
      tag_delete: { level: 'full', run: (a) => (need(a, 'tag_id'), panelCall('DELETE', `/api/library/tags/${enc(a.tag_id)}`)) },
      organise: { level: 'full', run: (a) => (need(a, 'documents'), panelCall('POST', '/api/library/organise', { body: { document_ids: (a.documents as string[]).map(doc), ...pick(a, 'folder_id', 'add_tags', 'remove_tags', 'kind', 'title') } })) },
    })

  tool('sb_images', 'Images: portraits and covers',
    'Images of an entity page or a document (editorial, never canon). list (read). upload (full, editor+): one PNG/JPEG/WebP as base64 (max 4 MB), optional caption, apply: true makes it the portrait or cover. '
    + 'generate (full): 1–4 images with the image model (when the workspace has one). apply / remove_cover / caption / delete (full). Example: {"action": "list", "target_type": "entity", "target": "Odo"}',
    {
      target_type: z.enum(['entity', 'document']).optional(), target: z.string().max(200).optional().describe('Entity or document id or name'), image_id: id.optional(),
      image_base64: z.string().max(B64_MAX).optional(), filename: z.string().max(200).optional(), caption: z.string().max(300).optional(), apply: z.boolean().optional(),
      prompt: z.string().max(2000).optional(), style: z.string().max(40).optional(), n: z.number().int().min(1).max(4).optional(),
    }, (() => {
      const target = (a: Args) => (need(a, 'target_type', 'target'), { target_type: a.target_type, target_id: a.target_type === 'entity' ? ent(a.target) : doc(a.target) })
      return {
        list: { level: 'read', run: async (a) => {
          const r = await panelCall('GET', '/api/images', { query: target(a) })
          return { target: r.target, art_style: r.art_style, images: r.images }
        } },
        upload: { level: 'full', run: async (a) => {
          need(a, 'image_base64', 'filename')
          const t = target(a)
          const form = new FormData()
          form.append('target_type', t.target_type)
          form.append('target_id', t.target_id)
          if (a.caption) form.append('caption', a.caption)
          if (a.apply) form.append('apply', '1')
          form.append('files', new Blob([b64(a.image_base64, 'image_base64')]), a.filename)
          const r = await panelCall('POST', '/api/images/upload', { form }) as { results: { status: string, message?: string, image?: unknown }[], applied: string | null }
          if (r.results[0]?.status === 'refused') throw new McpToolError('BAD_INPUT', r.results[0].message ?? 'Image refused.', { reason: 'IMAGE_REFUSED' })
          return { image: r.results[0]?.image, applied: r.applied }
        } },
        generate: { level: 'full', run: (a) => (need(a, 'prompt'), panelCall('POST', '/api/images', { body: { ...target(a), ...pick(a, 'prompt', 'style', 'n') } })) },
        apply: { level: 'full', run: (a) => (need(a, 'image_id'), panelCall('POST', `/api/images/${enc(a.image_id)}/apply`, { body: {} })) },
        remove_cover: { level: 'full', run: (a) => (need(a, 'image_id'), panelCall('DELETE', `/api/images/${enc(a.image_id)}/apply`)) },
        caption: { level: 'full', run: (a) => (need(a, 'image_id'), panelCall('PATCH', `/api/images/${enc(a.image_id)}`, { body: { caption: a.caption ?? '' } })) },
        delete: { level: 'full', run: (a) => (need(a, 'image_id'), panelCall('DELETE', `/api/images/${enc(a.image_id)}`)) },
      } satisfies Record<string, Action>
    })())

  // ---------------------------------------------------------------- AI runs (proposals and advice, never canon)
  tool('sb_continuity', 'Continuity check against canon',
    'run (propose): an AI check of a text (max 12,000 characters) against accepted canon, grounded by the server: each finding\'s sentence is in the text and cites only real canon ids; rule hits come from the rule engine. '
    + 'With passage_id the text must be words from that passage; without, it is a private draft check. Limited to 10 a person every 10 minutes. get (read): a run by id. Example: {"action": "run", "text": "Rourke rang the Ashbell at dawn and sang at noon."}',
    { text: z.string().max(12_000).optional(), passage_id: id.optional(), run_id: id.optional() }, {
      run: { level: 'propose', run: (a) => (need(a, 'text'), panelCall('POST', '/api/continuity', { body: pick(a, 'text', 'passage_id') })) },
      get: { level: 'read', run: (a) => (need(a, 'run_id'), panelCall('GET', `/api/continuity/${enc(a.run_id)}`)) },
    })

  tool('sb_research', 'Real-world research (never canon)',
    'Research answers real-world questions with sources and calculators; notes are labelled outside sources, never canon. run (propose; 6 a person every 10 minutes). list / get (read). '
    + 'promote (propose): a note as a PENDING rule or fact candidate quoting the note. pin / unpin (full): pin a note to a passage of the latest version. '
    + 'Example: {"action": "run", "question": "How long does a body take to cool to room temperature in winter?"}',
    {
      question: z.string().max(2000).optional(), note_id: id.optional(), as: z.enum(['rule', 'fact']).optional(),
      statement: z.string().max(500).optional(), subject: z.string().max(80).optional(), predicate: z.string().max(60).optional(), object: z.string().max(80).optional(),
      kind: z.enum(['rule', 'event', 'claim', 'character', 'location', 'relationship']).optional(), quote: z.string().max(2000).optional(),
      time_from: z.string().max(40).optional(), time_to: z.string().max(40).optional(), precision: z.enum(['exact', 'approximate']).optional(),
      document: z.string().max(200).optional().describe('pin: document id or file name'), passage_id: id.optional(), limit: limit(100, 30), cursor: mcpCursor,
    }, {
      run: { level: 'propose', run: (a) => (need(a, 'question'), panelCall('POST', '/api/research', { body: { question: a.question } })) },
      list: { level: 'read', run: async (a) => {
        const page = mcpPage(await panelCall('GET', '/api/research') as unknown[], a.cursor, a.limit ?? 30)
        return { total: page.total, next_cursor: page.next_cursor, notes: page.items }
      } },
      get: { level: 'read', run: (a) => (need(a, 'note_id'), panelCall('GET', `/api/research/${enc(a.note_id)}`)) },
      promote: { level: 'propose', run: (a) => (need(a, 'note_id', 'as', 'statement', 'subject', 'quote'), panelCall('POST', `/api/research/${enc(a.note_id)}/promote`, { body: pick(a, 'as', 'statement', 'subject', 'predicate', 'object', 'kind', 'quote', 'time_from', 'time_to', 'precision') })) },
      pin: { level: 'full', run: (a) => (need(a, 'note_id', 'document', 'quote'), panelCall('PATCH', `/api/research/${enc(a.note_id)}`, { body: { pin: { document_id: doc(a.document), quote: a.quote, ...pick(a, 'passage_id') } } })) },
      unpin: { level: 'full', run: (a) => (need(a, 'note_id'), panelCall('PATCH', `/api/research/${enc(a.note_id)}`, { body: { pin: null } })) },
    })

  tool('sb_conversation', 'Team conversations in Ask',
    'Ask\'s conversations are shared with the whole team. list / read (read). start / post (full; viewers may post too): a message in canon mode (grounded answer, or "unknown") or research mode (outside sources, not canon); action "continuity" checks the text in canon mode. '
    + 'rename (full, editor+). Example: {"action": "post", "conversation_id": "cnv_0123abcd", "text": "Where was Odo on D2?", "mode": "canon"}',
    {
      conversation_id: id.optional(), text: z.string().max(2000).optional(), mode: z.enum(['canon', 'research']).optional(), check_continuity: z.boolean().optional(),
      title: z.string().max(120).optional(), query: z.string().max(80).optional(), limit: limit(200, 30), cursor: mcpCursor,
    }, {
      list: { level: 'read', run: async (a) => {
        const page = mcpPage(await panelCall('GET', '/api/conversations', { query: { q: a.query } }) as unknown[], a.cursor, a.limit ?? 30)
        return { total: page.total, next_cursor: page.next_cursor, conversations: page.items }
      } },
      read: { level: 'read', run: (a) => (need(a, 'conversation_id'), panelCall('GET', `/api/conversations/${enc(a.conversation_id)}`)) },
      start: { level: 'full', run: (a) => (need(a, 'text'), panelCall('POST', '/api/conversations', { body: { text: a.text, mode: a.mode, ...(a.check_continuity && { action: 'continuity' }) } })) },
      post: { level: 'full', run: (a) => (need(a, 'conversation_id', 'text'), panelCall('POST', `/api/conversations/${enc(a.conversation_id)}/messages`, { body: { text: a.text, mode: a.mode, ...(a.check_continuity && { action: 'continuity' }) } })) },
      rename: { level: 'full', run: (a) => (need(a, 'conversation_id', 'title'), panelCall('PATCH', `/api/conversations/${enc(a.conversation_id)}`, { body: { title: a.title } })) },
    })

  // ---------------------------------------------------------------- Publishing and records
  const bibleScope = {
    scope: z.enum(['project', 'entities', 'folder']).optional(), entities: z.array(z.string().max(200)).max(500).optional().describe('scope entities: ids or names'),
    folder_id: id.optional(), sections: z.array(z.enum(SECTION_KEYS as [BibleSection, ...BibleSection[]])).min(1).max(20).optional().describe('Default: all but conflicts and editorial ("editorial" adds the wiki text, labelled not canon)'),
  }
  const bibleOptions = (a: Args) => ({ scope: a.scope, ...(a.entities && { entity_ids: (a.entities as string[]).map(ent) }), folder_id: a.folder_id, sections: a.sections, images: false })
  tool('sb_export', 'Export the story bible',
    'Any member may export (read). bible: accepted canon with verified citations as Markdown (format md) or structured JSON; book "manuscript" gives the source documents in reading order, book "bible" the bible laid out as a book (JSON). '
    + 'Long Markdown comes in pages (next_cursor). Audited as an export. EPUB, zip and PDF are files for people: download them in the app. Example: {"action": "bible", "format": "md"}',
    { format: z.enum(['md', 'json']).default('md').optional(), book: z.enum(['bible', 'manuscript']).optional(), ...bibleScope, max_chars: z.number().int().min(1000).max(50_000).default(40_000).optional(), cursor: mcpCursor }, {
      bible: { level: 'read', run: async (a) => {
        const out = await panelCall('GET', '/api/export/bible', { query: { format: a.format === 'json' ? 'json' : 'md', book: a.book, ...bibleOptions(a), sections: a.sections?.join(','), entity_ids: a.entities ? (a.entities as string[]).map(ent).join(',') : undefined } })
        return typeof out === 'string' ? { format: 'md', ...textPage(out, a.cursor, a.max_chars ?? 40_000) } : out
      } },
    })

  tool('sb_share', 'Read-only share links',
    'Public read-only links to the story bible (accepted canon only; never names, notes, candidates or audit). list (read). create (full, editor+): name, expiry 7 or 30 days (default never), scope; the link is returned once. '
    + 'revoke (full, editor+). Example: {"action": "create", "name": "Outsource writers", "days": 30}',
    { share_id: id.optional(), name: z.string().max(80).optional(), days: z.union([z.literal(7), z.literal(30)]).optional(), ...bibleScope }, {
      list: { level: 'read', run: () => panelCall('GET', '/api/shares') },
      create: { level: 'full', run: async (a) => {
        need(a, 'name')
        const r = await panelCall('POST', '/api/shares', { body: { name: a.name, days: a.days ?? null, options: bibleOptions(a) } })
        return { ...r, url: `/share/${r.token}` }
      } },
      revoke: { level: 'full', run: (a) => (need(a, 'share_id'), panelCall('DELETE', `/api/shares/${enc(a.share_id)}`)) },
    })

  tool('sb_audit', 'Audit trail',
    'The project\'s append-only audit trail, newest first: who did what, when (actions through an agent carry via "mcp" and the token name). list (read): filter by event type prefix (e.g. "candidate" or "change.applied"). '
    + 'export (read): the whole trail as md or json, in pages. Example: {"action": "list", "type": "candidate", "limit": 20}',
    { type: z.string().max(60).optional(), via_mcp: z.boolean().optional().describe('Only actions made through an agent'), format: z.enum(['md', 'json']).default('md').optional(), limit: limit(200, 50), cursor: mcpCursor }, {
      list: { level: 'read', run: async (a) => {
        const rows = (await panelCall('GET', '/api/audit') as Record<string, any>[])
          .filter(e => (!a.type || e.event_type === a.type || e.event_type.startsWith(`${a.type}.`)) && (!a.via_mcp || e.detail?.via === 'mcp'))
        const page = mcpPage(rows, a.cursor, a.limit ?? 50)
        return { total: page.total, next_cursor: page.next_cursor, events: page.items }
      } },
      export: { level: 'read', run: async (a) => {
        const out = await panelCall('GET', '/api/audit/export', { query: { format: a.format ?? 'md' } })
        return textPage(typeof out === 'string' ? out : JSON.stringify(out), a.cursor)
      } },
    })

  tool('sb_metrics', 'Measurements and project numbers',
    'stats (read): the project\'s counts (documents, pending, canon, conflicts, re-checks, tasks, notes). eval_runs (read): the last gold-set measurements against the spec targets. '
    + 'eval_run (propose): measure now (stores a run; changes nothing else). Example: {"action": "stats"}',
    {}, {
      stats: { level: 'read', run: () => panelCall('GET', '/api/stats') },
      eval_runs: { level: 'read', run: () => panelCall('GET', '/api/eval') },
      eval_run: { level: 'propose', run: () => panelCall('POST', '/api/eval') },
    })

  tool('sb_agent_runs', 'AI activity (receipts)',
    'Every AI run in the project, newest first: which agent (Extractor, Critic, Research, Continuity, Ask, Rule check, Images, Transcribe), model, prompt version, each step and what people did with the output. '
    + 'list (read): filter by purpose, or run (a target id from a "How was this made?" link). Paged. Example: {"action": "list", "purpose": "continuity", "limit": 5}',
    { purpose: z.enum(['extract', 'critic', 'research', 'continuity', 'answer', 'rule_check', 'image', 'transcribe']).optional(), run: id.optional(), limit: limit(50, 10), cursor: mcpCursor }, {
      list: { level: 'read', run: async (a) => {
        const page = mcpPage(await panelCall('GET', '/api/agents/runs', { query: pick(a, 'purpose', 'run') }) as unknown[], a.cursor, a.limit ?? 10)
        return { total: page.total, next_cursor: page.next_cursor, runs: page.items }
      } },
    })

  tool('sb_search', 'Search everything',
    'The panel\'s search over the project: canon facts, entity pages (any name), documents (title or text, latest versions) and notes, up to 6 of each. Read only; candidates never appear. Example: {"action": "search", "query": "salt gate"}',
    { query: z.string().min(1).max(80) }, {
      search: { level: 'read', run: (a) => panelCall('GET', '/api/search', { query: { q: a.query } }) },
    })
}
