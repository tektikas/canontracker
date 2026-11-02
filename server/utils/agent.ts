// A bounded tool-calling loop over the Meta Model API's Responses endpoint: the model plans and may run the built-in
// web_search and our own deterministic function tools; we run each function call and hand back its output until it answers.
// Bounded per effort level by steps, a hard wall-clock deadline (in-flight requests are aborted at it), output tokens per
// request, web searches per run and calculator calls per request. Meta's max_tool_calls counts every tool call in a request
// (searches, page opens and function calls alike; recorded in server/assets/meta-fixtures/agent-stateless-search-turn1), so it
// is sent as the searches left plus the calculator allowance, and the search budget is kept by our loop: once it is spent,
// web_search is dropped from the tools and the calculators stay. Page opens (web_search_call action open_page) don't use the
// search budget; their URLs become candidate sources. The last allowed step, or the last quarter of the time, tells the model
// to answer (tool_choice can only be "auto" on the Meta API, so a tool call there ends the run with an error).
// Commentary messages (phase "commentary": "I'll look up…") are progress notes, never part of the answer.
// Every model step and every tool run is one model_calls row (step index, tool, args, result summary, latency, tokens), so a
// trace can be shown. Live failures surface; there is no recorded fallback here.
import type { Calculator } from './calculators/index'

export const EFFORT = {
  low: { maxSteps: 3, maxMs: 60_000, maxOutputTokens: 4_000, maxSearches: 3, calcsPerStep: 4 },
  high: { maxSteps: 10, maxMs: 300_000, maxOutputTokens: 16_000, maxSearches: 12, calcsPerStep: 8 },
} as const
export type Effort = keyof typeof EFFORT

export interface AgentToolCall { name: string, args: Record<string, unknown>, result: unknown, assumptions: string[], error: string | null }
export interface AgentRun {
  text: string, toolCalls: AgentToolCall[], searches: string[], citations: { url: string, title: string }[], steps: number, tokens: number
}

interface OutputItem {
  type: string, id?: string, name?: string, call_id?: string, arguments?: string, status?: string
  phase?: string
  action?: { type?: string, query?: string, queries?: string[], url?: string }
  results?: { title?: string, url?: string }[]
  content?: { type: string, text?: string, annotations?: { type: string, url?: string, title?: string }[] }[]
}
interface Reply { output?: OutputItem[], usage?: { total_tokens?: number }, error?: { message?: string } | null, status?: string, incomplete_details?: { reason?: string } | null }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const short = (v: unknown, max = 400) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

export function recordStep(row: {
  purpose: keyof typeof PROMPT_VERSIONS, target: { type: string, id: string }, modelId: string, projectId: string, step: number, tool: string | null
  input: string | null, status: 'ok' | 'failed', latency: number, summary: string | null, error: string | null, tokens: number | null
}) {
  useDb().prepare(`insert into model_calls (id, purpose, model_id, prompt_version, target_type, target_id, input_refs, input, status,
    latency_ms, output_summary, error, created_at, project_id, step, tool, tokens) values (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(newId('mc'), row.purpose, row.modelId, PROMPT_VERSIONS[row.purpose], row.target.type, row.target.id, row.input, row.status,
      row.latency, row.summary, row.error, now(), row.projectId, row.step, row.tool, row.tokens)
}

// One Responses request with the Meta API's retry rules: 429/500/503 are retried with backoff and jitter (3 attempts), never
// 400/401/402/403/404/413; a 504 (a long non-streaming run) is not resent unchanged but resubmitted as a background
// response and polled. ponytail: the 504 → background path follows the Meta docs but has not been exercised live.
async function responses(body: Record<string, unknown>, deadline: number): Promise<Reply> {
  const { metaBaseUrl } = useRuntimeConfig()
  const headers = { Authorization: `Bearer ${apiKey()}` }
  // Every request is aborted at the deadline; nothing runs past it.
  const left = () => {
    const ms = deadline - Date.now()
    if (ms <= 0) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    return ms
  }
  for (let attempt = 1; ; attempt++) {
    try {
      return await $fetch<Reply>(`${metaBaseUrl}/responses`, { method: 'POST', timeout: Math.min(180_000, left()), headers, body })
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if ([429, 500, 503].includes(status ?? 0) && attempt < 3) {
        await new Promise(r => setTimeout(r, Math.min(left(), 500 * 2 ** (attempt - 1) + Math.random() * 250)))
        continue
      }
      if (status !== 504) throw e
      // Background mode keeps the response server-side (store) and is polled until it settles.
      let job = await $fetch<Reply & { id: string, status: string }>(`${metaBaseUrl}/responses`, { method: 'POST', timeout: Math.min(30_000, left()), headers, body: { ...body, store: true, background: true } })
      while (['queued', 'in_progress'].includes(job.status)) {
        await new Promise(r => setTimeout(r, Math.min(left(), 2_000)))
        job = await $fetch(`${metaBaseUrl}/responses/${job.id}`, { timeout: Math.min(30_000, left()), headers })
      }
      if (job.status !== 'completed') throw Object.assign(new Error(job.error?.message ?? `background response ${job.status}`), { statusCode: 502 })
      return job
    }
  }
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/g

export async function runAgent(o: {
  purpose: keyof typeof PROMPT_VERSIONS, target: { type: string, id: string }, projectId: string
  instructions: string, input: string, tools: Calculator[], webSearch: boolean, effort: Effort
}): Promise<AgentRun> {
  const { modelId } = useRuntimeConfig()
  const limit = EFFORT[o.effort]
  const deadline = Date.now() + limit.maxMs // hard: requests in flight are aborted at it
  // State: stateless replay (store: false). Every item the model produced (reasoning as encrypted content, searches,
  // calls, messages) goes back in `input` with our outputs; previous_response_id is never used (with this include it is a 400).
  const items: unknown[] = [{ role: 'user', content: o.input }]
  const run: AgentRun = { text: '', toolCalls: [], searches: [], citations: [], steps: 0, tokens: 0 }
  const search = o.webSearch ? [{ type: 'web_search' }] : []
  const functions = o.tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters }))
  const base = { purpose: o.purpose, target: o.target, modelId, projectId: o.projectId }
  let searchCalls = 0

  for (let step = 0; ; step++) {
    const searchesLeft = Math.max(0, limit.maxSearches - searchCalls)
    const tools = [...(searchesLeft ? search : []), ...functions]
    // ponytail: max_tool_calls caps the request's total, not each kind, so one request can still search up to its calculator
    // allowance past the budget; the next step then has no web_search. Per-kind caps would need an API that has them.
    const maxToolCalls = (searchesLeft && search.length ? searchesLeft : 0) + (functions.length ? limit.calcsPerStep : 0)
    // tool_choice only accepts "auto" on the Meta API, so the last step can't forbid tools: it asks for the answer instead.
    const last = step >= limit.maxSteps - 1 || deadline - Date.now() < limit.maxMs / 4 || !tools.length
    const nudge = last ? 'Step limit reached: give your final answer now, without calling more tools.' : null
    const t0 = Date.now()
    let reply: Reply
    try {
      reply = await responses({ model: modelId, instructions: o.instructions, input: nudge ? [...items, { role: 'user', content: nudge }] : items,
        ...(tools.length && { tools, max_tool_calls: maxToolCalls }), max_output_tokens: limit.maxOutputTokens, store: false,
        include: ['reasoning.encrypted_content', ...(searchesLeft && search.length ? ['web_search_call.results'] : [])] }, deadline)
    } catch (e) {
      const err = Date.now() >= deadline
        ? createError({ statusCode: 504, statusMessage: 'RESEARCH_TIMEOUT', message: `Research failed: it ran past its ${limit.maxMs / 60_000}-minute time limit. Nothing was stored.` })
        : apiFailure(e as Parameters<typeof apiFailure>[0], 'Research failed', 'Nothing was stored.')
      recordStep({ ...base, step, tool: null, input: step ? null : o.input, status: 'failed', latency: Date.now() - t0, summary: null, tokens: null, error: err.message })
      throw err
    }
    const out = reply.output ?? []
    const tokens = reply.usage?.total_tokens ?? null
    run.steps = step + 1
    run.tokens += tokens ?? 0
    const webCalls = out.filter(i => i.type === 'web_search_call')
    const opens = webCalls.filter(i => i.action?.type === 'open_page' && i.action.url).map(i => i.action!.url!)
    const searchItems = webCalls.filter(i => i.action?.type !== 'open_page')
    const searches = searchItems.flatMap(i => i.action?.queries ?? (i.action?.query ? [i.action.query] : []))
    const results = webCalls.flatMap(i => i.results ?? []).filter(r => r.url)
    const calls = out.filter(i => i.type === 'function_call' && i.name && i.call_id)
    const messages = out.filter(i => i.type === 'message')
    // The answer is the last message that isn't commentary; commentary is never answer text.
    const answer = messages.filter(i => i.phase !== 'commentary').at(-1)
    const text = (answer?.content ?? []).filter(c => c.type === 'output_text').map(c => c.text ?? '').join('\n').trim()
    run.searches.push(...searches)
    searchCalls += searchItems.length
    // Candidate sources (each still goes through verification): pages the model opened, then the ones it cited as
    // url_citation annotations, or (they can be empty) URLs written in its answer.
    const cited = messages.flatMap(i => i.content ?? []).flatMap(c => c.annotations ?? []).filter(a => a.type === 'url_citation' && a.url).map(a => ({ url: a.url!, title: a.title ?? '' }))
    run.citations.push(...opens.map(url => ({ url, title: '' })), ...(cited.length ? cited : (text.match(URL_IN_TEXT) ?? []).map(url => ({ url, title: '' }))))
    recordStep({ ...base, step, tool: webCalls.length ? 'web_search' : null, input: step ? null : o.input, status: 'ok', latency: Date.now() - t0, tokens, error: null,
      summary: [searches.length && `${plural(searches.length, 'web search')}: ${short(searches.join(' | '), 300)}`,
        opens.length && `opened ${plural(opens.length, 'page')}: ${short(opens.join(' | '), 300)}`,
        results.length && `${plural(results.length, 'result')}: ${short(results.map(r => `${r.title || 'untitled'} <${r.url}>`).join(' | '), 600)}`,
        calls.length && `asked for ${calls.map(c => c.name).join(', ')}`, text && !calls.length && 'answered'].filter(Boolean).join('; ') || 'no output' })

    if (!calls.length || last) {
      if (!text) {
        const why = reply.incomplete_details?.reason === 'max_output_tokens' ? `reached its output limit (${limit.maxOutputTokens} tokens) before answering`
          : calls.length ? `did not finish within ${plural(limit.maxSteps, 'step')}` : 'returned no answer'
        recordStep({ ...base, step, tool: null, input: null, status: 'failed', latency: 0, summary: null, error: `The model ${why}.`, tokens: null })
        throw createError({ statusCode: 502, statusMessage: 'MODEL_BAD_OUTPUT', message: `Research failed: the model ${why}. Nothing was stored.` })
      }
      run.text = text
      return run
    }

    // The model's own items go back as they came (reasoning, searches, calls, any interim message), followed by our outputs.
    // Search results (asked for with include, for the trace) are not sent back: replayed web_search_call items are recorded
    // as accepted without them (agent-stateless-search-turn2).
    items.push(...out.filter(i => ['reasoning', 'web_search_call', 'function_call', 'message'].includes(i.type)).map(({ results: _, ...i }) => i))
    for (const c of calls) {
      const t1 = Date.now()
      const tool = o.tools.find(t => t.name === c.name)
      let args: Record<string, unknown> = {}
      let call: AgentToolCall
      try {
        const parsed = JSON.parse(c.arguments || '{}')
        args = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
        if (!tool) throw new Error(`no tool named ${c.name}`)
        const r = tool.run(args)
        call = { name: c.name!, args, result: r.result, assumptions: r.assumptions, error: null }
      } catch (e) {
        call = { name: c.name!, args, result: null, assumptions: [], error: (e as Error).message }
      }
      run.toolCalls.push(call)
      recordStep({ ...base, step, tool: c.name!, input: short(args, 2000), status: call.error ? 'failed' : 'ok', latency: Date.now() - t1, tokens: null,
        summary: call.error ? null : short(call.result), error: call.error })
      items.push({ type: 'function_call_output', call_id: c.call_id,
        output: JSON.stringify(call.error ? { error: call.error } : { result: call.result, assumptions: call.assumptions }) })
    }
  }
}
