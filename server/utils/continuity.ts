import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { AgentTool, AgentToolCall } from './agent'

// Continuity check: the agent reads a text (a draft scene, a selected passage, lines typed in Ask) and checks it against
// accepted canon by calling our own MCP read tools step by step: the same server and handlers an outside agent gets over /mcp,
// connected in process, inside the caller's access()/pid(). It may only read; sb_check_facts is the deterministic rule engine.
// The report is grounded here, never taken on the model's word: a finding's sentence must be in the checked text, every fact
// it cites must be accepted canon (re-read from the database, quote and source included), and rule hits come from the
// sb_check_facts results themselves, kept only when the fact checked is tied to a finding's sentence. What fails is listed as dropped, with why.
// Fixes are text a person reads; nothing is applied. Stored: the run (continuity_runs + its model_calls steps). A person may
// send a finding to review as a pending candidate (POST /api/facts with continuity_id); nothing else is written.

export const CONTINUITY_TOOLS = ['sb_get_entity', 'sb_search_facts', 'sb_get_fact', 'sb_get_timeline', 'sb_read_document', 'sb_check_facts']
export const MAX_CONTINUITY_CHARS = 12_000
const KINDS = ['contradicts', 'depends_on', 'new'] as const
const SEVERITY_RANK = { hard: 0, soft: 1, info: 2 } as const
const FACT_KINDS = ['character', 'claim', 'event', 'relationship', 'rule']
type Severity = keyof typeof SEVERITY_RANK

export interface ContinuityCheck {
  rule: string, severity: 'hard' | 'soft', confidence: number | null, rationale: string, fact_ids: string[]
  left: Record<string, unknown>, right: Record<string, unknown>
}
export interface ContinuityFinding {
  sentence: string, kind: typeof KINDS[number], severity: Severity, explanation: string, fix: string | null, fact_ids: string[], checks: number[]
  claim: { kind: string, subject: string, predicate: string, object: string | null, time_from: string | null, time_to: string | null, statement: string } | null
}
export interface ContinuityReport { summary: string, findings: ContinuityFinding[], checks: ContinuityCheck[], dropped: { sentence: string, reason: string }[] }
export type ContinuitySource = 'draft' | 'passage' | 'text'

const INSTRUCTIONS = `You are the continuity checker inside CanonTracker, where game and story teams keep their approved canon with source quotes. A writer gives you a text (a draft scene or a passage). Check it against the project's accepted canon with the tools, and report where the text contradicts canon or depends on it.

How to work:
1. Read the text. Note what canon could speak to: who is where and when, relationships (and whether they have ended), deaths, titles, items, world rules.
2. Look it up: sb_get_entity for each named character, place or item; sb_get_timeline for the story times involved; sb_search_facts for anything else; sb_get_fact or sb_read_document when you need a fact's exact source.
3. Run sb_check_facts once with the text's whereabouts and relationship claims as structured facts: subject and object are the entity names canon uses; whereabouts use predicate "located_at" with object = the place; story times look like "D2 21:30". Its answers are deterministic rule checks: rely on them, don't restate them as your own judgement.
4. Answer.

Rules:
- Only accepted canon counts. Wiki summaries, fields and notes are editorial, not canon: never cite them.
- Every contradiction and every dependency cites at least one canon fact id ("fact_…") that a tool returned. Never invent ids or quotes. When canon has nothing on a claim, it is "new", not a contradiction.
- "sentence" is copied character for character from the text: the sentence or clause the finding is about.
- severity: "hard" = the text can't be true if canon is; "soft" = a likely problem (approximate times, a tight journey, a tension); "info" = consistent with canon, or new.
- Report every contradiction; then at most 5 of the most important dependencies and new claims. Don't list every consistent line.
- "fix" is a suggested rewrite of the line or a short note on what to change (one or two sentences); the writer decides. null when nothing needs fixing.
- When the text gives no story day, read it as the day canon gives for the scene it describes, and say so in the explanation.

Your final message is ONLY a JSON object, no prose around it:
{"summary":"one or two plain sentences","findings":[{"sentence":"exact words from the text","kind":"contradicts|depends_on|new","severity":"hard|soft|info","fact_ids":["fact_…"],"explanation":"one or two sentences","fix":"suggested rewrite or null","claim":{"kind":"event|relationship|claim|character|rule","subject":"…","predicate":"…","object":"… or null","time_from":"D2 21:30 or null","time_to":"… or null","statement":"what the text says, as one sentence"}}]}`

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

// --- Limits ---------------------------------------------------------------------------------------------------------------

// A check runs the live model for up to a few minutes: 10 checks per person and 40 per project every 10 minutes, on every
// entry point (the writer, Ask). Call before any work; it counts the check.
const perPerson = fixedWindow(10, 600_000)
const perProject = fixedWindow(40, 600_000)
export function continuityThrottle() {
  const user = access().user.id, project = pid()
  const wait = Math.max(perPerson(user, false), perProject(project, false))
  if (wait) throw createError({ statusCode: 429, statusMessage: 'TOO_MANY_REQUESTS', message: `Continuity checks are limited to 10 per person and 40 per project every 10 minutes. Try again in ${Math.ceil(wait / 60_000)} min.` })
  perPerson(user)
  perProject(project)
}

// --- The tools: our own MCP server, connected in process ---------------------------------------------------------------

async function canonTools() {
  const server = buildMcpServer({ id: `continuity:${access().user.id}`, name: 'Continuity check' })
  const client = new Client({ name: 'story-bible-continuity', version: '1.0.0' })
  const [mine, theirs] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(theirs), client.connect(mine)])
  const listed = (await client.listTools()).tools.filter(t => CONTINUITY_TOOLS.includes(t.name))
  const tools: AgentTool[] = listed.map(({ name, description, inputSchema: { $schema: _, ...parameters } }) => ({
    name, description: description ?? '', parameters,
    async run(args: Record<string, unknown>) {
      const r = await client.callTool({ name, arguments: args })
      const text = (r.content as { type: string, text?: string }[]).find(c => c.type === 'text')?.text ?? '{}'
      const data = JSON.parse(text)
      if (r.isError) throw new Error(data?.error?.message ?? 'The tool failed.')
      return { result: data, assumptions: [] }
    },
  }))
  return { tools, close: () => client.close() }
}

// --- Grounding --------------------------------------------------------------------------------------------------------------

export function parseReport(text: string): Record<string, unknown> | null {
  for (let i = text.indexOf('{'); i !== -1; i = text.indexOf('{', i + 1)) {
    try {
      const v = JSON.parse(text.slice(i, text.lastIndexOf('}') + 1))
      if (v && typeof v === 'object' && Array.isArray(v.findings)) return v
    } catch { /* try the next brace */ }
  }
  return null
}

// A rule hit is about a sentence only when the fact the AI passed to sb_check_facts is tied to it: its subject and its place or
// object are both named in that sentence (the whole name, or one of its capitalised words of 3+ letters, as a whole word).
// ponytail: plain word match, so a sentence that names someone only as "he" or by an alias doesn't tie; add aliases if that bites.
const fold = (s: string) => ` ${s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
function names(sentence: string, ...name: unknown[]) {
  const s = fold(sentence)
  return name.some(n => typeof n === 'string' && fold(n).trim() !== '' && (s.includes(fold(n))
    || n.split(/[^\p{L}\p{N}]+/u).some(w => /^\p{Lu}/u.test(w) && w.length >= 3 && s.includes(fold(w)))))
}

/** The grounded report from the model's answer, the tool calls it made and the ids of this project's accepted canon. Self-check: scripts/continuity-check.ts. */
export function groundReport(text: string, out: Record<string, unknown>, calls: AgentToolCall[], canon: Set<string>): ContinuityReport {
  const findings: (ContinuityFinding & { hard: boolean })[] = []
  const dropped: ContinuityReport['dropped'] = []
  for (const f of (out.findings as Record<string, any>[]).slice(0, 30)) {
    const said = str(f?.sentence, 1500)
    const sentence = said ? quoteMatches(text, said)[0] : undefined
    if (!sentence) {
      dropped.push({ sentence: said, reason: 'These words are not in the checked text.' })
      continue
    }
    const cited: unknown[] = Array.isArray(f.fact_ids) ? f.fact_ids : []
    const kind = KINDS.find(k => k === f.kind) ?? 'depends_on'
    const reason = cited.some(id => typeof id !== 'string' || !canon.has(id)) ? 'It cites a fact that isn’t canon.'
      : kind === 'new' && cited.length ? 'It is marked new but cites canon facts; a new claim cites none.'
        : kind !== 'new' && !cited.length ? 'It cited no accepted canon fact.' : null
    if (reason) {
      dropped.push({ sentence, reason })
      continue
    }
    const c = f.claim as Record<string, unknown> | null
    const claim = c && str(c.subject, 80) && str(c.predicate, 60) && str(c.statement, 500)
      ? { kind: FACT_KINDS.includes(str(c.kind, 20)) ? str(c.kind, 20) : 'claim', subject: str(c.subject, 80), predicate: str(c.predicate, 60), object: str(c.object, 80) || null,
          time_from: str(c.time_from, 20) || null, time_to: str(c.time_to, 20) || null, statement: str(c.statement, 500) }
      : null
    const fact_ids = [...new Set(cited as string[])]
    // A model may report the same finding twice (Muse did): same sentence, kind and cited facts is one finding.
    if (findings.some(x => x.sentence === sentence && x.kind === kind && [...x.fact_ids].sort().join() === [...fact_ids].sort().join())) continue
    findings.push({ sentence, kind, severity: 'info', hard: f.severity === 'hard', explanation: str(f.explanation, 1000), fix: str(f.fix, 1000) || null, fact_ids, checks: [], claim })
  }

  // Rule hits exactly as sb_check_facts returned them (deterministic), once each, kept only when every fact of the text in the
  // hit is tied to the sentence of a kept finding; the hit is linked to those findings.
  const checks: ContinuityCheck[] = []
  const seen = new Set<string>()
  for (const call of calls) {
    if (call.name !== 'sb_check_facts' || call.error) continue
    const result = call.result as { would_raise?: Record<string, any>[], proposed?: Record<string, any>[] } | null
    const args = ((call.args as { facts?: Record<string, any>[] }).facts ?? [])
    for (const h of result?.would_raise ?? []) {
      const key = JSON.stringify([h.rule, h.left, h.right])
      if (seen.has(key)) continue
      seen.add(key)
      const sides = [h.left, h.right].filter(s => typeof s?.proposed_index === 'number')
      const tied = (s: Record<string, any>) => {
        const a = args[s.proposed_index] ?? {}, r = result?.proposed?.[s.proposed_index] ?? {}
        const hasObject = [a.object, r.object].some(o => typeof o === 'string' && o.trim())
        return findings.flatMap((f, i) => names(f.sentence, a.subject, r.subject) && (!hasObject || names(f.sentence, a.object, r.object)) ? [i] : [])
      }
      const linked = sides.map(tied)
      if (!sides.length || linked.some(l => !l.length)) {
        dropped.push({ sentence: sides.map(s => String(s.statement ?? '')).join(' / '),
          reason: `Rule hit (${h.rule}) left out: the fact the AI checked isn’t tied to a sentence of the text (its subject and place or object must both be named in one).` })
        continue
      }
      const at = checks.push({ rule: String(h.rule), severity: h.severity === 'hard' ? 'hard' : 'soft', confidence: typeof h.confidence === 'number' ? h.confidence : null,
        rationale: String(h.rationale ?? ''), left: h.left ?? {}, right: h.right ?? {}, fact_ids: [h.left?.fact_id, h.right?.fact_id].filter((id): id is string => typeof id === 'string') }) - 1
      for (const i of new Set(linked.flat())) findings[i]!.checks.push(at)
    }
  }
  // A rule hit decides the severity; otherwise only a contradiction can be hard or soft.
  const done = findings.map(({ hard, ...f }) => ({ ...f, severity: (f.checks.length ? (f.checks.some(i => checks[i]!.severity === 'hard') ? 'hard' : 'soft')
    : f.kind === 'contradicts' ? (hard ? 'hard' : 'soft') : 'info') as Severity }))
  done.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  // The summary is built from the kept findings, so it never claims more than they show. The AI's own summary stays only when nothing was left out.
  const n = (k: Severity | 'new') => done.filter(f => (k === 'new' ? f.kind === 'new' : f.kind !== 'new' && f.severity === k)).length
  const summary = dropped.length ? (done.length ? `${done.length} finding${done.length === 1 ? '' : 's'}: ${[n('hard') && `${n('hard')} hard`, n('soft') && `${n('soft')} soft`, n('info') && `${n('info')} to note`, n('new') && `${n('new')} not in canon yet`].filter(Boolean).join(', ')}.` : 'No finding is backed by canon.')
    : str(out.summary, 800)
  return { summary, findings: done, checks, dropped }
}

// --- The run ----------------------------------------------------------------------------------------------------------------

function composeInput(text: string, where: string | null) {
  return [`Text to check${where ? ` (${where})` : ''}:`, '"""', text, '"""',
    where ? 'It is a passage of an imported source, so canon may cite these very words: a fact quoting them agrees with the text, it is not a contradiction.' : ''].filter(Boolean).join('\n')
}

// Recorded runs (mock mode): the text must match one exactly (whitespace aside). Its tool calls run for real against this
// project, so the rule checks are this project's; the recorded findings name canon facts by statement and are grounded like a live answer.
interface Recorded { text: string, steps: { tool: string, args: Record<string, unknown> }[][], final: { summary: string, findings: (Record<string, unknown> & { facts?: string[] })[] } }

export async function runContinuity(input: { text: string, source: ContinuitySource, documentId?: string | null, passageId?: string | null, where?: string | null }) {
  const text = input.text.trim()
  if (!text) throw createError({ statusCode: 400, statusMessage: 'TEXT_REQUIRED', message: 'There is no text to check.' })
  if (text.length > MAX_CONTINUITY_CHARS) throw createError({ statusCode: 413, statusMessage: 'TOO_LONG', message: `Check up to ${MAX_CONTINUITY_CHARS.toLocaleString('en')} characters at a time: select a scene or part of one.` })
  const id = newId('cty')
  const target = { type: 'continuity', id }
  const projectId = pid()
  const prompt = composeInput(text, input.where ?? null)
  const mock = modelInfo().mode === 'mock'
  const rec = mock ? ((await useStorage('assets:server').getItem<Recorded[]>('continuity:recorded.json')) ?? []).find(r => norm(r.text) === norm(text)) : undefined
  if (mock && !rec) throw createError({ statusCode: 503, statusMessage: 'MODEL_OFFLINE', message: 'Continuity checks run on the live AI model, which isn’t switched on here, so nothing was checked.' })
  const modelId = rec ? 'mock:recorded-fixtures' : modelInfo().id
  // The run row (author, source: a draft is private) exists before the first model call, so the trace of a run that fails
  // part-way is as private as a finished one. Its report stays 'null' until the run is grounded (getContinuityRun: 404).
  useDb().prepare(`insert into continuity_runs (id, source, document_id, passage_id, text, report, model_id, prompt_version, created_by, created_at, project_id)
    values (?, ?, ?, ?, ?, 'null', ?, ?, ?, ?, ?)`).run(id, input.source, input.documentId ?? null, input.passageId ?? null, text, modelId,
    PROMPT_VERSIONS.continuity, access().user.id, now(), projectId)
  const { tools, close } = await canonTools()
  let out: Record<string, unknown> | null
  let calls: AgentToolCall[]
  try {
    if (rec) {
      calls = []
      const base = { purpose: 'continuity' as const, target, modelId, projectId, effort: 'high' }
      for (const [step, batch] of rec.steps.entries()) {
        recordStep({ ...base, step, tool: null, input: step ? null : prompt, status: 'ok', latency: 0, tokens: null, error: null, summary: `asked for ${batch.map(b => b.tool).join(', ')}` })
        for (const b of batch) {
          const t0 = Date.now()
          let call: AgentToolCall
          try {
            const r = await tools.find(t => t.name === b.tool)!.run(b.args)
            call = { name: b.tool, args: b.args, result: r.result, assumptions: [], error: null }
          } catch (e) {
            call = { name: b.tool, args: b.args, result: null, assumptions: [], error: (e as Error).message }
          }
          calls.push(call)
          recordStep({ ...base, step, tool: b.tool, input: JSON.stringify(b.args).slice(0, 2000), status: call.error ? 'failed' : 'ok', latency: Date.now() - t0, tokens: null,
            summary: call.error ? null : JSON.stringify(call.result).slice(0, 400), error: call.error })
        }
      }
      recordStep({ ...base, step: rec.steps.length, tool: null, input: null, status: 'ok', latency: 0, tokens: null, error: null, summary: 'answered' })
      // Recorded findings name canon facts by statement (ids differ per project).
      const byStatement = new Map((useDb().prepare(`select id, statement from facts where project_id = ? and status = 'canon' order by rowid`).all(projectId) as { id: string, statement: string }[]).map(f => [f.statement, f.id]))
      out = { ...rec.final, findings: rec.final.findings.map(({ facts, ...f }) => ({ ...f, fact_ids: (facts ?? []).map(s => byStatement.get(s) ?? `missing: ${s}`) })) }
    } else {
      const run = await runAgent({ purpose: 'continuity', target, projectId, instructions: INSTRUCTIONS, input: prompt, tools, webSearch: false, effort: 'high', label: 'Continuity check' })
      calls = run.toolCalls
      out = parseReport(run.text)
      if (!out) {
        recordStep({ purpose: 'continuity', target, modelId, projectId, step: run.steps, tool: null, input: null, status: 'failed', latency: 0, summary: null, error: 'The final message was not the JSON report.', tokens: null, effort: 'high' })
        throw createError({ statusCode: 502, statusMessage: 'MODEL_BAD_OUTPUT', message: 'Continuity check failed: the AI did not return its report in the expected form, so there is no report.' })
      }
    }
  } finally {
    await close()
  }
  const report = groundReport(text, out, calls, new Set((useDb().prepare(`select id from facts where project_id = ? and status = 'canon'`).all(projectId) as { id: string }[]).map(f => f.id)))
  useDb().prepare('update continuity_runs set report = ? where id = ?').run(JSON.stringify(report), id)
  return getContinuityRun(id)
}

// --- Reading runs --------------------------------------------------------------------------------------------------------

interface RunRow { id: string, source: ContinuitySource, document_id: string | null, passage_id: string | null, text: string, report: string, model_id: string, prompt_version: string, created_by: string, created_at: string }

/** A draft's check is as private as the draft: only its author reads it (404 for anyone else). */
export const continuityVisible = (c: string) => `${c}.source != 'draft' or ${c}.created_by = ?`
/** A model_calls row of a continuity run shows only with its run row, and only to someone who may read that run (fails closed). One ? (user id). */
export const continuityTraceVisible = (m: string) => `(${m}.target_type != 'continuity' or exists (select 1 from continuity_runs c where c.id = ${m}.target_id and c.project_id = ${m}.project_id and (${continuityVisible('c')})))`

export function getContinuityRun(id: string) {
  const r = useDb().prepare(`select c.*, u.name created_by_name, d.title document_title, p.start_line, p.end_line from continuity_runs c
    left join users u on u.id = c.created_by left join documents d on d.id = c.document_id left join passages p on p.id = c.passage_id
    where c.id = ? and c.project_id = ? and c.report != 'null' and (${continuityVisible('c')})`).get(id, pid(), access().user.id) as unknown as (RunRow & { created_by_name: string, document_title: string | null, start_line: number | null, end_line: number | null }) | undefined
  if (!r) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Continuity check not found.' })
  const report = JSON.parse(r.report) as ContinuityReport
  const ids = [...new Set([...report.findings.flatMap(f => f.fact_ids), ...report.checks.flatMap(c => c.fact_ids)])]
  const facts = ids.length ? listFacts(`f.id in (${ids.map(() => '?').join(', ')})`, ...ids) : []
  // A document check can send findings to review only while it cites the latest version.
  const latest = r.document_id ? useDb().prepare(`select d.id = (select d2.id from documents d2 where d2.project_id = d.project_id and d2.filename = d.filename order by d2.version desc limit 1) latest
    from documents d where d.id = ?`).get(r.document_id) as { latest: number } | undefined : undefined
  const candidates = useDb().prepare('select id, statement, status from facts where project_id = ? and origin = ? order by rowid').all(pid(), `continuity:${r.id}`) as { id: string, statement: string, status: string }[]
  const { report: _, ...run } = r
  return { ...run, ...report, facts: Object.fromEntries(facts.map(f => [f.id, f])), can_propose: !!latest?.latest, candidates }
}
