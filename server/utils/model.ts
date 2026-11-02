// All model calls go through here. MODEL_MODE=mock replays recorded fixture output;
// MODEL_MODE=meta calls the Meta Model API (OpenAI-compatible). The key never leaves the server.
// Every call, mock or live, is written to model_calls so the UI can show what the model was asked and with which sources.

export interface CandidateDraft {
  kind: string, subject: string, predicate: string, object?: string | null, value?: string | null, statement: string, quote: string
  time?: { from?: string, to?: string, precision?: 'exact' | 'approximate' }
  confidence?: number
}

export interface RuleViolation { fact_id: string, rationale: string, confidence: number }

export const PROMPT_VERSIONS = { extract: 'extract-v1', answer: 'answer-v2', rule_check: 'rule-check-v2', image: 'image-v1' } as const

export function modelInfo() {
  const { modelMode, modelId } = useRuntimeConfig()
  return modelMode === 'meta'
    ? { mode: 'meta', id: modelId, label: `${modelId === 'muse-spark-1.3' ? 'Muse Spark 1.3' : modelId} via Meta Model API` }
    : { mode: 'mock', id: 'mock:recorded-fixtures', label: 'Recorded demo run (model offline)' }
}

// Images have no recorded fallback: in mock mode there is simply no image model.
export function imageModelInfo() {
  const { modelMode, imageModelId } = useRuntimeConfig()
  return { live: modelMode === 'meta', id: imageModelId, label: `${imageModelId === 'muse-image-1.0' ? 'Muse Image 1.0' : imageModelId} via Meta Model API` }
}

async function traced<T>(
  purpose: keyof typeof PROMPT_VERSIONS, target: { type: string, id: string }, inputRefs: string[], input: string | null,
  fn: () => Promise<T>, summarize: (r: T) => string, modelId = modelInfo().id,
): Promise<T> {
  const started = Date.now()
  const record = (status: string, summary: string | null, error: string | null) =>
    useDb().prepare(`insert into model_calls (id, purpose, model_id, prompt_version, target_type, target_id, input_refs, input, status,
      latency_ms, output_summary, error, created_at, project_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(newId('mc'), purpose, modelId, PROMPT_VERSIONS[purpose], target.type, target.id, JSON.stringify(inputRefs), input,
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

function apiKey() {
  const { metaApiKey } = useRuntimeConfig()
  if (!metaApiKey)
    throw createError({ statusCode: 503, statusMessage: 'MODEL_NOT_CONFIGURED', message: 'Meta Model API key is not set (NUXT_META_API_KEY).' })
  return metaApiKey
}

// One plain sentence for every way a Meta Model API call can fail. Never falls back to recorded output.
function apiFailure(
  e: { statusCode?: number, data?: { error?: { code?: string, message?: string }, detail?: string }, name?: string, message: string, cause?: { code?: string } },
  what = 'Model call failed', after = 'Nothing was replaced with recorded output.',
) {
  const code = e.data?.error?.code, detail = (e.data?.error?.message ?? e.data?.detail)?.replace(/\.$/, '')
  const why = e.statusCode === 402 ? 'billing is not set up for this Meta Model API key (402)'
    : e.statusCode === 401 || e.statusCode === 403 ? `the Meta Model API rejected the key (${e.statusCode})`
    : e.statusCode === 429 ? 'rate limited by the Meta Model API (429)'
    : !e.statusCode ? (e.name === 'TimeoutError' || /timeout|aborted/i.test(e.message) ? 'the Meta Model API timed out' : `could not reach the Meta Model API (${e.cause?.code ?? e.message})`)
    : `Meta Model API error ${e.statusCode}`
  return createError({ statusCode: 503, statusMessage: 'MODEL_UNAVAILABLE', message: `${what}: ${why}${code || detail ? ` — ${[code, detail].filter(Boolean).join(': ')}` : ''}. ${after}` })
}

async function chatJson(system: string, user: string) {
  const { metaBaseUrl, modelId } = useRuntimeConfig()
  const res = await $fetch<{ choices: { message: { content: string } }[] }>(`${metaBaseUrl}/chat/completions`, {
    method: 'POST',
    timeout: 60_000,
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: { model: modelId, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] },
  }).catch((e) => { throw apiFailure(e) })
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

// The demo sets with a recorded run. Their filenames are disjoint (S01.md vs S01-homecoming.md) and so are their rule phrases,
// so one lookup across all of them is exact.
const RECORDED_SETS = ['broken-tide', 'ashbell-pass']
const recorded = async <T>(key: string) => Promise.all(RECORDED_SETS.map(set => useStorage('assets:server').getItem<T>(`${set}:${key}`)))
const recordedCandidates = async (filename: string) =>
  (await recorded<Record<string, CandidateDraft[]>>('candidates.json')).map(c => c?.[filename]).find(Boolean)

// Recorded mode only has extraction output for the demo sets' files, keyed by filename.
export async function hasRecordedExtraction(filename: string) {
  return !!(await recordedCandidates(filename))
}

export function extractCandidates(doc: { id: string, filename: string, title: string, text: string }) {
  return traced('extract', { type: 'document', id: doc.id }, [doc.id], null, async (): Promise<CandidateDraft[]> => {
    if (modelInfo().mode === 'mock') return (await recordedCandidates(doc.filename)) ?? []
    const out = await chatJson(
      `You extract narrative canon candidates from game lore documents. Return JSON {"candidates":[...]}.
Each candidate: {"kind":"character|location|relationship|event|rule|claim","subject":"short entity name","predicate":"snake_case verb","object":"entity name or null","value":"number for measurable rules (e.g. travel minutes) or null","statement":"one plain sentence","quote":"EXACT verbatim substring of the document that supports it","time":{"from":"D<day> HH:MM","to":"D<day> HH:MM","precision":"exact|approximate"} or omitted (day-only "D<day>" means the whole day; days before D1 are D0, D-1, D-3650 …),"confidence":0-1}.
Rules: quotes must be copied character-for-character. Do not invent facts. Use first names for characters. Use predicate "located_at" for where someone is at a time and "travel_time" (value in minutes) for travel durations. Use predicate "is" only with an object that says what the subject is (e.g. "keeper of the Solen Lighthouse").
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
      const runs = (await recorded<{ rule_contains: string, violations: { statement: string, rationale: string, confidence: number }[] }[]>('rule-checks.json')).flatMap(r => r ?? [])
      const run = runs.find(r => rule.statement.includes(r.rule_contains))
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

// Muse Image via the OpenAI-style images endpoint. The success shape is not documented yet, so both data[].b64_json and
// data[].url are accepted; URLs are downloaded (safely, see downloadImage) and stored, never hot-linked. Anything that isn't
// a raster image fails loudly. One deadline covers the API call, its body and every download.
const MAX_IMAGE_BYTES = 20_000_000
const MAX_B64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4
const MAX_API_BYTES = 4 * (MAX_B64_CHARS + 1024) + 65_536
export function generateImages(prompt: string, n: number, target: { type: string, id: string }) {
  const { metaBaseUrl, imageModelId } = useRuntimeConfig()
  const bad = (why: string) => createError({ statusCode: 502, statusMessage: 'MODEL_BAD_OUTPUT', message: `Image generation failed: ${why}. No image was saved.` })
  return traced('image', target, [target.id], prompt, async () => {
    const deadline = new AbortController()
    const timer = setTimeout(() => deadline.abort(new DOMException('Image generation timed out', 'TimeoutError')), IMAGE_DEADLINE_MS)
    const timedOut = () => deadline.signal.aborted
    try {
      const res = await fetchCapped(`${metaBaseUrl}/images/generations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: imageModelId, prompt, n }),
      }, MAX_API_BYTES, deadline.signal).catch((e) => {
        if (e instanceof FetchRefused) throw bad(e.message)
        throw apiFailure(timedOut() ? { name: 'TimeoutError', message: 'timeout' } : e, 'Image generation failed', 'No image was saved.')
      })
      let json: { data?: { b64_json?: unknown, url?: unknown }[], error?: { code?: string, message?: string }, detail?: string } | null = null
      try {
        json = JSON.parse(res.body.toString('utf8'))
      } catch { /* judged below */ }
      if (res.status < 200 || res.status >= 300)
        throw apiFailure({ statusCode: res.status, data: json ?? undefined, message: `HTTP ${res.status}` }, 'Image generation failed', 'No image was saved.')
      if (!json) throw bad('Muse Image did not return JSON')
      if (!Array.isArray(json.data) || !json.data.length) throw bad('Muse Image returned no images')
      const images = await Promise.all(json.data.slice(0, n).map(async (d) => {
        let bytes: Buffer
        if (typeof d?.b64_json === 'string') {
          if (d.b64_json.length > MAX_B64_CHARS) throw bad('the image is larger than 20 MB')
          bytes = Buffer.from(d.b64_json, 'base64')
        } else if (typeof d?.url === 'string') {
          bytes = await downloadImage(d.url, MAX_IMAGE_BYTES, deadline.signal).catch((e) => {
            throw bad(timedOut() ? 'the image download timed out' : `could not download the image (${e.message})`)
          })
        } else throw bad('the response had neither b64_json nor a URL')
        const type = imageType(bytes)
        if (!type) throw bad('the response was not a PNG, JPEG, WebP or GIF image')
        return { bytes, type }
      }))
      return { images, extra: json.data.length - images.length }
    } finally {
      clearTimeout(timer)
      deadline.abort() // stops any download still running after a sibling failed
    }
  }, r => `${plural(r.images.length, 'image')}${r.extra > 0 ? ` (Muse Image returned ${r.extra} more than asked; not kept)` : ''}`, imageModelId)
}
