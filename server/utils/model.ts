// All model calls go through here. MODEL_MODE=mock replays recorded fixture output;
// MODEL_MODE=meta calls the Meta Model API (OpenAI-compatible). The key never leaves the server.
// Every call, mock or live, is written to model_calls so the UI can show what the model was asked and with which sources.

export interface CandidateDraft {
  kind: string, subject: string, predicate: string, object?: string | null, value?: string | null, statement: string, quote: string
  time?: { from?: string, to?: string, precision?: 'exact' | 'approximate' }
  confidence?: number
}

export interface RuleViolation { fact_id: string, rationale: string, confidence: number }

export const PROMPT_VERSIONS = { extract: 'extract-v1', answer: 'answer-v2', rule_check: 'rule-check-v2' } as const

export function modelInfo() {
  const { modelMode, modelId } = useRuntimeConfig()
  return modelMode === 'meta'
    ? { mode: 'meta', id: modelId, label: `${modelId === 'muse-spark-1.3' ? 'Muse Spark 1.3' : modelId} via Meta Model API` }
    : { mode: 'mock', id: 'mock:recorded-fixtures', label: 'Recorded demo run (model offline)' }
}

async function traced<T>(
  purpose: keyof typeof PROMPT_VERSIONS, target: { type: string, id: string }, inputRefs: string[], input: string | null,
  fn: () => Promise<T>, summarize: (r: T) => string,
): Promise<T> {
  const started = Date.now()
  const record = (status: string, summary: string | null, error: string | null) =>
    useDb().prepare(`insert into model_calls (id, purpose, model_id, prompt_version, target_type, target_id, input_refs, input, status,
      latency_ms, output_summary, error, created_at, project_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(newId('mc'), purpose, modelInfo().id, PROMPT_VERSIONS[purpose], target.type, target.id, JSON.stringify(inputRefs), input,
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
  const { metaApiKey, metaBaseUrl, modelId } = useRuntimeConfig()
  if (!metaApiKey)
    throw createError({ statusCode: 503, statusMessage: 'MODEL_NOT_CONFIGURED', message: 'Meta Model API key is not set (NUXT_META_API_KEY).' })
  const res = await $fetch<{ choices: { message: { content: string } }[] }>(`${metaBaseUrl}/chat/completions`, {
    method: 'POST',
    timeout: 60_000,
    headers: { Authorization: `Bearer ${metaApiKey}` },
    body: { model: modelId, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] },
  }).catch((e) => {
    const code = e.data?.error?.code, detail = e.data?.error?.message ?? e.data?.detail
    const why = e.statusCode === 402 ? 'billing is not set up for this Meta Model API key (402)'
      : e.statusCode === 401 || e.statusCode === 403 ? `the Meta Model API rejected the key (${e.statusCode})`
      : e.statusCode === 429 ? 'rate limited by the Meta Model API (429)'
      : !e.statusCode ? (e.name === 'TimeoutError' || /timeout|aborted/i.test(e.message) ? 'the Meta Model API timed out' : `could not reach the Meta Model API (${e.cause?.code ?? e.message})`)
      : `Meta Model API error ${e.statusCode}`
    throw createError({ statusCode: 503, statusMessage: 'MODEL_UNAVAILABLE', message: `Model call failed: ${why}${code || detail ? ` — ${[code, detail].filter(Boolean).join(': ')}` : ''}. Nothing was replaced with recorded output.` })
  })
  const text = res.choices?.[0]?.message?.content ?? ''
  try {
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'MODEL_BAD_OUTPUT', message: 'Model call failed: the model did not return valid JSON.' })
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

interface PromptFact { id: string, statement: string, subject: string, predicate: string, object: string | null }

// Facts as the model sees them: statement and quote as written, plus the structured subject/object analysis uses. After a
// merge those carry the kept name while the wording may not, so the identity notes say which names a person decided are one entity.
function factLines(facts: PromptFact[]) {
  const quote = useDb().prepare('select quote from evidence where fact_id = ? and verified = 1 order by rowid limit 1')
  return facts.map((f) => {
    const q = quote.get(f.id) as { quote: string } | undefined
    return `[${f.id}] ${f.statement}\n  subject: ${f.subject}; predicate: ${f.predicate}; object: ${f.object ?? '-'}${q ? `\n  quote: "${q.quote}"` : ''}`
  }).join('\n')
}
function identityNotes(facts: PromptFact[]) {
  const used = new Set(facts.flatMap(f => [normName(f.subject), normName(f.object)]))
  const merges = (useDb().prepare('select name, canonical, merged_at from entity_merges where project_id = ? order by rowid').all(pid()) as { name: string, canonical: string, merged_at: string }[])
    .filter(m => used.has(normName(m.canonical)) && normName(m.canonical) !== normName(m.name))
  return merges.length
    ? `\n\nSame entity (a person merged these names; statements and quotes may still use the old one):\n${merges.map(m => `- "${m.name}" is "${m.canonical}" (merged ${m.merged_at.slice(0, 10)})`).join('\n')}`
    : ''
}

const recorded = <T>(key: string) => useStorage('assets:server').getItem<T>(`broken-tide:${key}`)

export function extractCandidates(doc: { id: string, filename: string, title: string, text: string }) {
  return traced('extract', { type: 'document', id: doc.id }, [doc.id], null, async (): Promise<CandidateDraft[]> => {
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
export function answerFromCanon(question: string, traceId: string, facts: PromptFact[]) {
  const input = `Facts:\n${factLines(facts)}${identityNotes(facts)}`
  return traced('answer', { type: 'question', id: traceId }, facts.map(f => f.id), input, async () => {
    if (modelInfo().mode === 'mock') return { answer: null as string | null, factIds: [] as string[] }
    const out = await chatJson(
      `Answer questions about a story using ONLY the numbered canon facts given. Return JSON {"answer": string or null, "fact_ids": [ids used]}.
Each fact's subject and object are the canonical entity names; names listed under "Same entity" refer to one entity.
If the facts do not fully support an answer, return {"answer": null, "fact_ids": []}. Never use outside knowledge.`,
      `${input}\n\nQuestion: ${question}`,
    )
    return { answer: typeof out.answer === 'string' ? out.answer : null, factIds: Array.isArray(out.fact_ids) ? out.fact_ids as string[] : [] }
  }, r => (r.answer ? `answer citing ${plural(r.factIds.length, 'fact')}` : 'no answer'))
}

// Semantic check: which accepted facts break a world rule? Model-suggested; a person decides.
export function checkRule(rule: PromptFact, facts: PromptFact[]) {
  const input = `Rule:\n${factLines([rule])}\n\nFacts:\n${factLines(facts)}${identityNotes([rule, ...facts])}`
  return traced('rule_check', { type: 'fact', id: rule.id }, facts.map(f => f.id), input, async (): Promise<RuleViolation[]> => {
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
Each fact's subject and object are the canonical entity names; names listed under "Same entity" refer to one entity.
Only list facts that cannot be true if the rule holds as written. Being related to the rule is not enough. Return {"violations":[]} if none.`,
      input,
    )
    const ids = new Set(facts.map(f => f.id))
    return (Array.isArray(out.violations) ? out.violations as RuleViolation[] : []).filter(v => ids.has(v.fact_id))
  }, r => plural(r.length, 'violation'))
}
