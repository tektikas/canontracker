// A bounded tool-calling loop over the Meta Model API's Responses endpoint: the model plans and may run the built-in
// web_search and our own deterministic function tools; we run each function call and hand back its output until it answers.
// Bounded by steps and wall time per effort level; the last allowed step tells the model to answer (tool_choice can only
// be "auto" on the Meta API, so a tool call there ends the run with an error instead of another step).
// Every model step and every tool run is one model_calls row (step index, tool, args, result summary, latency, tokens), so a
// trace can be shown. Live failures surface; there is no recorded fallback here.
import type { Calculator } from './calculators/index'

export const EFFORT = {
  low: { maxSteps: 3, maxMs: 60_000 },
  high: { maxSteps: 10, maxMs: 300_000 },
} as const
export type Effort = keyof typeof EFFORT

export interface AgentToolCall { name: string, args: Record<string, unknown>, result: unknown, assumptions: string[], error: string | null }
export interface AgentRun {
  text: string, toolCalls: AgentToolCall[], searches: string[], citations: { url: string, title: string }[], steps: number, tokens: number
}

interface OutputItem {
  type: string, id?: string, name?: string, call_id?: string, arguments?: string, status?: string
  action?: { query?: string, queries?: string[] }
  content?: { type: string, text?: string, annotations?: { type: string, url?: string, title?: string }[] }[]
}
interface Reply { output?: OutputItem[], usage?: { total_tokens?: number }, error?: { message?: string } | null, status?: string }

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
  const left = () => Math.max(15_000, deadline - Date.now())
  for (let attempt = 1; ; attempt++) {
    try {
      return await $fetch<Reply>(`${metaBaseUrl}/responses`, { method: 'POST', timeout: Math.min(180_000, left()), headers, body })
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if ([429, 500, 503].includes(status ?? 0) && attempt < 3) {
        await new Promise(r => setTimeout(r, 500 * 2 ** (attempt - 1) + Math.random() * 250))
        continue
      }
      if (status !== 504) throw e
      // Background mode keeps the response server-side (store) and is polled until it settles.
      let job = await $fetch<Reply & { id: string, status: string }>(`${metaBaseUrl}/responses`, { method: 'POST', timeout: 30_000, headers, body: { ...body, store: true, background: true } })
      while (['queued', 'in_progress'].includes(job.status)) {
        if (Date.now() > deadline) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
        await new Promise(r => setTimeout(r, 2_000))
        job = await $fetch(`${metaBaseUrl}/responses/${job.id}`, { timeout: 30_000, headers })
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
  const started = Date.now()
  const deadline = started + limit.maxMs + 120_000 // the last step may run past maxMs; nothing runs past this
  // State: stateless replay (store: false). Every item the model produced (reasoning as encrypted content, searches,
  // calls, messages) goes back in `input` with our outputs; previous_response_id is never used (with this include it is a 400).
  const items: unknown[] = [{ role: 'user', content: o.input }]
  const run: AgentRun = { text: '', toolCalls: [], searches: [], citations: [], steps: 0, tokens: 0 }
  const search = o.webSearch ? [{ type: 'web_search' }] : []
  const functions = o.tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters }))
  // Mixing web_search and function tools in one request is not confirmed for the Meta API. If the first mixed request is
  // refused (400), the run switches to split steps: step 1 searches only, later steps run calculators only.
  let split = !search.length || !functions.length ? null : false as boolean | null
  const base = { purpose: o.purpose, target: o.target, modelId, projectId: o.projectId }

  for (let step = 0; ; step++) {
    // tool_choice only accepts "auto" on the Meta API, so the last step can't forbid tools: it asks for the answer instead.
    const last = step >= limit.maxSteps - 1 || Date.now() - started > limit.maxMs
    const tools = split ? (step === 0 ? search : functions) : [...search, ...functions]
    const nudge = last ? 'Step limit reached: give your final answer now, without calling more tools.'
      : split && step === 0 ? 'First search for sources. You can run the calculators in the next step.' : null
    const t0 = Date.now()
    let reply: Reply
    try {
      reply = await responses({ model: modelId, instructions: o.instructions, input: nudge ? [...items, { role: 'user', content: nudge }] : items, tools,
        store: false, include: ['reasoning.encrypted_content'] }, deadline)
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      const err = apiFailure(e as Parameters<typeof apiFailure>[0], 'Research failed', 'Nothing was stored.')
      recordStep({ ...base, step, tool: null, input: step ? null : o.input, status: 'failed', latency: Date.now() - t0, summary: null, error: err.message, tokens: null })
      if (status === 400 && split === false && step === 0) {
        split = true
        step--
        continue
      }
      throw err
    }
    const out = reply.output ?? []
    const tokens = reply.usage?.total_tokens ?? null
    run.steps = step + 1
    run.tokens += tokens ?? 0
    const searches = out.filter(i => i.type === 'web_search_call').flatMap(i => i.action?.queries ?? (i.action?.query ? [i.action.query] : []))
    const calls = out.filter(i => i.type === 'function_call' && i.name && i.call_id)
    const texts = out.filter(i => i.type === 'message').flatMap(i => i.content ?? []).filter(c => c.type === 'output_text')
    const text = texts.map(c => c.text ?? '').join('\n').trim()
    run.searches.push(...searches)
    // Pages the model cited: url_citation annotations, or (they can be empty) URLs written in its text.
    const cited = texts.flatMap(c => c.annotations ?? []).filter(a => a.type === 'url_citation' && a.url).map(a => ({ url: a.url!, title: a.title ?? '' }))
    run.citations.push(...(cited.length ? cited : (text.match(URL_IN_TEXT) ?? []).map(url => ({ url, title: '' }))))
    recordStep({ ...base, step, tool: searches.length ? 'web_search' : null, input: step ? null : o.input, status: 'ok', latency: Date.now() - t0, tokens, error: null,
      summary: [searches.length && `${searches.length} web search${searches.length === 1 ? '' : 'es'}: ${short(searches.join(' | '), 300)}`,
        calls.length && `asked for ${calls.map(c => c.name).join(', ')}`, text && !calls.length && 'answered'].filter(Boolean).join('; ') || 'no output' })

    // In split mode the search step's message is notes for the next step, not the answer.
    const searchOnly = split && step === 0 && !last
    if (!searchOnly && (!calls.length || last)) {
      if (!text) {
        const why = calls.length ? `did not finish within ${plural(limit.maxSteps, 'step')}` : 'returned no answer'
        recordStep({ ...base, step, tool: null, input: null, status: 'failed', latency: 0, summary: null, error: `The model ${why}.`, tokens: null })
        throw createError({ statusCode: 502, statusMessage: 'MODEL_BAD_OUTPUT', message: `Research failed: the model ${why}. Nothing was stored.` })
      }
      run.text = text
      return run
    }

    // The model's own items go back as they came (reasoning, searches, calls, any interim message), followed by our outputs.
    items.push(...out.filter(i => ['reasoning', 'web_search_call', 'function_call', 'message'].includes(i.type)))
    if (searchOnly) items.push({ role: 'user', content: 'Now run the calculators you need, then give the final JSON answer.' })
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
