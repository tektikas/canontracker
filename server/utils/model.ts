// All model calls go through here. MODEL_MODE=mock replays recorded fixture output;
// MODEL_MODE=llama calls the Meta Llama API (OpenAI-compatible). The key never leaves the server.
// Every call, mock or live, is written to model_calls so the UI can show what the model was asked and with which sources.

export interface CandidateDraft {
  kind: string, subject: string, predicate: string, object?: string | null, value?: string | null, statement: string, quote: string
  time?: { from?: string, to?: string, precision?: 'exact' | 'approximate' }
  confidence?: number
}

export interface RuleViolation { fact_id: string, rationale: string, confidence: number }

export const PROMPT_VERSIONS = { extract: 'extract-v1', answer: 'answer-v1', rule_check: 'rule-check-v1' } as const

export function modelInfo() {
  const { modelMode, modelId } = useRuntimeConfig()
  return modelMode === 'llama'
    ? { mode: 'llama', id: modelId, label: `Meta Llama API · ${modelId}` }
    : { mode: 'mock', id: 'mock:recorded-fixtures', label: 'Recorded demo run (model offline)' }
}

async function traced<T>(
  purpose: keyof typeof PROMPT_VERSIONS, target: { type: string, id: string }, inputRefs: string[],
  fn: () => Promise<T>, summarize: (r: T) => string,
): Promise<T> {
  const started = Date.now()
  const record = (status: string, summary: string | null, error: string | null) =>
    useDb().prepare('insert into model_calls values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId('mc'), purpose, modelInfo().id, PROMPT_VERSIONS[purpose], target.type, target.id, JSON.stringify(inputRefs),
        status, Date.now() - started, summary, error, now(), pid())
  try {
    const result = await fn()
    record('ok', summarize(result), null)
    return result
  } catch (e) {
    record('failed', null, (e as Error).message)
    throw e
  }
}

async function chatJson(system: string, user: string) {
  const { llamaApiKey, llamaBaseUrl, modelId } = useRuntimeConfig()
  if (!llamaApiKey || !modelId)
    throw createError({ statusCode: 503, statusMessage: 'MODEL_NOT_CONFIGURED', message: 'Set NUXT_LLAMA_API_KEY and NUXT_MODEL_ID.' })
  const res = await $fetch<{ choices: { message: { content: string } }[] }>(`${llamaBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${llamaApiKey}` },
    body: { model: modelId, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] },
  }).catch((e) => {
    throw createError({ statusCode: 503, statusMessage: 'MODEL_UNAVAILABLE', message: `Model call failed: ${e.statusCode ?? ''} ${e.data?.detail ?? e.message}` })
  })
  const text = res.choices[0]?.message.content ?? ''
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const recorded = <T>(key: string) => useStorage('assets:server').getItem<T>(`broken-tide:${key}`)

export function extractCandidates(doc: { id: string, filename: string, title: string, text: string }) {
  return traced('extract', { type: 'document', id: doc.id }, [doc.id], async (): Promise<CandidateDraft[]> => {
    if (modelInfo().mode === 'mock') return (await recorded<Record<string, CandidateDraft[]>>('candidates.json'))?.[doc.filename] ?? []
    const out = await chatJson(
      `You extract narrative canon candidates from game lore documents. Return JSON {"candidates":[...]}.
Each candidate: {"kind":"character|location|relationship|event|rule|claim","subject":"short entity name","predicate":"snake_case verb","object":"entity name or null","value":"number for measurable rules (e.g. travel minutes) or null","statement":"one plain sentence","quote":"EXACT verbatim substring of the document that supports it","time":{"from":"D<day> HH:MM","to":"D<day> HH:MM","precision":"exact|approximate"} or omitted,"confidence":0-1}.
Rules: quotes must be copied character-for-character. Do not invent facts. Use first names for characters. Use predicate "located_at" for where someone is at a time and "travel_time" (value in minutes) for travel durations.
Figurative language ("my sister in all but blood") is NOT a literal relationship; skip it or give it low confidence.`,
      `Document: ${doc.title}\n\n${doc.text}`,
    )
    return Array.isArray(out.candidates) ? out.candidates : []
  }, r => plural(r.length, 'candidate'))
}

// Returns a null answer when the model is offline; the caller then shows related sources only.
export function answerFromCanon(question: string, traceId: string, facts: { id: string, statement: string }[]) {
  return traced('answer', { type: 'question', id: traceId }, facts.map(f => f.id), async () => {
    if (modelInfo().mode === 'mock') return { answer: null as string | null, factIds: [] as string[] }
    const out = await chatJson(
      `Answer questions about a story using ONLY the numbered canon facts given. Return JSON {"answer": string or null, "fact_ids": [ids used]}.
If the facts do not fully support an answer, return {"answer": null, "fact_ids": []}. Never use outside knowledge.`,
      `Facts:\n${facts.map(f => `[${f.id}] ${f.statement}`).join('\n')}\n\nQuestion: ${question}`,
    )
    return { answer: typeof out.answer === 'string' ? out.answer : null, factIds: Array.isArray(out.fact_ids) ? out.fact_ids as string[] : [] }
  }, r => (r.answer ? `answer citing ${plural(r.factIds.length, 'fact')}` : 'no answer'))
}

// Semantic check: which accepted facts break a world rule? Model-suggested; a person decides.
export function checkRule(rule: { id: string, statement: string }, facts: { id: string, statement: string }[]) {
  return traced('rule_check', { type: 'fact', id: rule.id }, facts.map(f => f.id), async (): Promise<RuleViolation[]> => {
    if (modelInfo().mode === 'mock') {
      const runs = await recorded<{ rule_contains: string, violations: { statement: string, rationale: string, confidence: number }[] }[]>('rule-checks.json')
      const run = runs?.find(r => rule.statement.includes(r.rule_contains))
      return (run?.violations ?? []).flatMap((v) => {
        const fact = facts.find(f => f.statement === v.statement)
        return fact ? [{ fact_id: fact.id, rationale: v.rationale, confidence: v.confidence }] : []
      })
    }
    const out = await chatJson(
      `You check a story's world rule against its accepted facts. Return JSON {"violations":[{"fact_id":"...","rationale":"one sentence","confidence":0-1}]}.
Only list facts that cannot be true if the rule holds as written. Being related to the rule is not enough. Return {"violations":[]} if none.`,
      `Rule: ${rule.statement}\n\nFacts:\n${facts.map(f => `[${f.id}] ${f.statement}`).join('\n')}`,
    )
    const ids = new Set(facts.map(f => f.id))
    return (Array.isArray(out.violations) ? out.violations as RuleViolation[] : []).filter(v => ids.has(v.fact_id))
  }, r => plural(r.length, 'violation'))
}
