import { createHash } from 'node:crypto'
import { asDetail } from '../../shared/utils/detail.ts'
import type { Turn, Wav } from './audio'

// All model calls go through here. MODEL_MODE=mock replays recorded fixture output;
// MODEL_MODE=meta calls the Meta Model API (OpenAI-compatible). The key never leaves the server.
// Every call, mock or live, is written to model_calls so the UI can show what the model was asked and with which sources.

export interface CandidateDraft {
  kind: string, subject: string, predicate: string, object?: string | null, value?: string | null, statement: string, quote: string
  time?: { from?: string, to?: string, precision?: 'exact' | 'approximate' }
  confidence?: number
  /** What the AI says each name is (NAME_TYPES); "none" = not a name with its own identity. Feeds the wiki only. */
  subject_type?: string | null, object_type?: string | null
}

export interface RuleViolation { fact_id: string, rationale: string, confidence: number }

export const PROMPT_VERSIONS = { extract: 'extract-v5', answer: 'answer-v2', rule_check: 'rule-check-v3', image: 'image-v1', research: 'research-v1', continuity: 'continuity-v1', critic: 'critic-v2', transcribe: 'transcribe-v1' } as const

// A bundled sample's load replays its recording even on a live server (the request sets event.context.sampleReplay): the
// recordings are what the samples are, loading them takes seconds instead of minutes of model calls, and the trace says
// mock:recorded-fixtures. Everything after the load (your own documents, scans, Ask, research) runs live.
const sampleReplay = () => { try { return !!useEvent().context.sampleReplay } catch { return false } }
export function modelInfo() {
  const { modelMode, modelId } = useRuntimeConfig()
  return modelMode === 'meta' && !sampleReplay()
    ? { mode: 'meta', id: modelId, label: `${modelId === 'muse-spark-1.3' ? 'Muse Spark 1.3' : modelId} via Meta Model API` }
    : { mode: 'mock', id: 'mock:recorded-fixtures', label: 'AI' }
}

// Images have no recorded fallback: in mock mode there is simply no image model.
export function imageModelInfo() {
  const { modelMode, imageModelId } = useRuntimeConfig()
  return { live: modelMode === 'meta', id: imageModelId, label: `${imageModelId === 'muse-image-1.0' ? 'Muse Image 1.0' : imageModelId} via Meta Model API` }
}

async function traced<T>(
  purpose: keyof typeof PROMPT_VERSIONS, target: { type: string, id: string }, inputRefs: string[], input: string | null,
  fn: () => Promise<T>, summarize: (r: T) => string, modelId = modelInfo().id, effort: string | null = null,
): Promise<T> {
  const started = Date.now()
  const record = (status: string, summary: string | null, error: string | null) =>
    useDb().prepare(`insert into model_calls (id, purpose, model_id, prompt_version, target_type, target_id, input_refs, input, status,
      latency_ms, output_summary, error, created_at, project_id, effort) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(newId('mc'), purpose, modelId, PROMPT_VERSIONS[purpose], target.type, target.id, JSON.stringify(inputRefs), input,
        status, Date.now() - started, summary, error, now(), pid(), effort)
  try {
    const result = await fn()
    record('ok', summarize(result), null)
    return result
  } catch (e) {
    record('failed', null, (e as Error).message)
    throw e
  }
}

export function apiKey() {
  const { metaApiKey } = useRuntimeConfig()
  if (!metaApiKey)
    throw createError({ statusCode: 503, statusMessage: 'MODEL_NOT_CONFIGURED', message: 'The AI provider key is not set (NUXT_META_API_KEY).' })
  return metaApiKey
}

// One plain sentence for every way a Meta Model API call can fail. Never falls back to recorded output.
export function apiFailure(
  e: { statusCode?: number, data?: { error?: { code?: string, message?: string }, detail?: string }, name?: string, message: string, cause?: { code?: string } },
  what = 'Model call failed', after = 'Nothing was replaced with recorded output.',
) {
  const code = e.data?.error?.code, detail = (e.data?.error?.message ?? e.data?.detail)?.replace(/\.$/, '')
  const why = e.statusCode === 402 ? 'billing is not set up for this AI provider key (402)'
    : e.statusCode === 401 || e.statusCode === 403 ? `the AI provider rejected the key (${e.statusCode})`
    : e.statusCode === 429 ? 'rate limited by the AI provider (429)'
    : !e.statusCode ? (e.name === 'TimeoutError' || /timeout|aborted/i.test(e.message) ? 'the AI provider timed out' : `could not reach the AI provider (${e.cause?.code ?? e.message})`)
    : `AI provider error ${e.statusCode}`
  return createError({ statusCode: 503, statusMessage: 'MODEL_UNAVAILABLE', message: `${what}: ${why}${code || detail ? ` — ${[code, detail].filter(Boolean).join(': ')}` : ''}. ${after}` })
}

// schema: a JSON schema the output is constrained to (response_format json_schema); the reply is still parsed and validated.
// reasoningEffort: sent as reasoning_effort (Muse defaults to "high" without it; "none" is refused with json_schema).
// onUsage: the reply's token usage, for the model_calls trace.
export interface ChatUsage { completion_tokens?: number, completion_tokens_details?: { reasoning_tokens?: number } }
async function chatJson(system: string, user: string, opts: { schema?: { name: string, schema: object }, model?: string, reasoningEffort?: string, onUsage?: (u: ChatUsage) => void } = {}) {
  const { metaBaseUrl, modelId } = useRuntimeConfig()
  const res = await $fetch<{ choices: { message: { content: string } }[], usage?: ChatUsage }>(`${metaBaseUrl}/chat/completions`, {
    method: 'POST',
    timeout: 180_000, // a whole chapter's extraction on Muse can take over a minute even at low effort
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: {
      model: opts.model ?? modelId, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      ...(opts.schema && { response_format: { type: 'json_schema', json_schema: { ...opts.schema, strict: true } } }),
      ...(opts.reasoningEffort && { reasoning_effort: opts.reasoningEffort }),
    },
  }).catch((e) => { throw apiFailure(e) })
  if (res.usage) opts.onUsage?.(res.usage)
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

// The demo sets with a recorded run. Recorded output is replayed only for a sample's own text: the sha256 of the imported
// content must equal the sha256 of one of the set's source files (docs/ or v2/). A file that merely shares a sample's name
// gets nothing, so an unrelated upload never receives another story's candidates.
const RECORDED_SETS = ['broken-tide', 'ashbell-pass', 'sherlock-holmes', 'oz', 'alice']
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
let sources: Promise<Map<string, { set: string, filename: string, candidates?: CandidateDraft[] }>> | undefined
const recordedSources = () => sources ??= (async () => {
  const assets = useStorage('assets:server')
  const map = new Map<string, { set: string, filename: string, candidates?: CandidateDraft[] }>()
  // A sample recording's transcript is a source like the docs: its recorded candidates replay for that exact text only.
  for (const r of await recordedRecordings()) map.set(sha(transcriptOf(r.turns).content), { set: r.set, filename: r.file, candidates: r.candidates })
  for (const set of RECORDED_SETS) {
    for (const dir of ['docs', 'v2']) {
      for (const key of await assets.getKeys(`${set}:${dir}`)) {
        const text = await assets.getItem<string>(key)
        if (text) map.set(sha(String(text)), { set, filename: key.split(':').pop()! })
      }
    }
  }
  return map
})()
const recordedCandidates = async (text: string) => {
  const src = (await recordedSources()).get(sha(text))
  return src && (src.candidates ?? (await useStorage('assets:server').getItem<Record<string, CandidateDraft[]>>(`${src.set}:candidates.json`))?.[src.filename])
}

// Recorded mode only has extraction output for the demo sets' own source texts.
export async function hasRecordedExtraction(text: string) {
  return !!(await recordedCandidates(text))
}

// Live output is checked before it reaches the review queue: an item without the text fields a fact needs is dropped (and
// counted in model_calls), a kind outside the six becomes "event" (located_at) or "claim". A story time that isn't
// "D<day>" / "D<day> HH:MM" drops the whole item, with the raw time in model_calls: the time is part of what the fact claims
// (where someone is *when*), so keeping it timeless would change its meaning, and a half-read fact never reaches review.
// The quote itself is judged later, verbatim, by extractInto.
const KINDS = ['character', 'location', 'relationship', 'event', 'rule', 'claim']
export const NAME_TYPES = ['character', 'location', 'item', 'faction', 'event', 'other', 'none'] as const
const nameType = (v: unknown) => (NAME_TYPES as readonly unknown[]).includes(v) ? v as string : null
const field = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
export function cleanCandidates(raw: unknown) {
  const list = Array.isArray(raw) ? raw : []
  const badTimes: string[] = []
  const kept = list.flatMap((c): CandidateDraft[] => {
    const subject = field(c?.subject), predicate = field(c?.predicate), statement = field(c?.statement), quote = typeof c?.quote === 'string' ? c.quote : ''
    if (!subject || !predicate || !statement || !quote.trim()) return []
    const kind = KINDS.includes(c.kind) ? c.kind : predicate === 'located_at' ? 'event' : 'claim'
    const t = c.time && typeof c.time === 'object' ? { from: field(c.time.from) || undefined, to: field(c.time.to) || undefined } : null
    // null / "" / {} (or only a precision) mean no time; anything else must parse.
    if ((c.time != null && c.time !== '' && !t) || ((t?.from || t?.to) && parseStoryRange(t.from, t.to).bad)) {
      badTimes.push(JSON.stringify(t ? [t.from, t.to].filter(Boolean).join(' – ') : c.time))
      return []
    }
    if (t?.to && t.to === t.from) delete t.to // a point in time, not a range
    const confidence = typeof c.confidence === 'number' && c.confidence >= 0 && c.confidence <= 1 ? c.confidence : undefined
    const detail = asDetail({ predicate, object: field(c.object) || null, value: field(c.value) || null })
    return [{ kind, subject, ...detail, statement, quote, confidence, subject_type: nameType(c.subject_type), object_type: detail.object ? nameType(c.object_type) : null,
      ...(t && (t.from || t.to) && { time: { ...t, precision: c.time.precision === 'approximate' ? 'approximate' : 'exact' } }) }]
  })
  return { kept, malformed: list.length - kept.length - badTimes.length, badTimes }
}
const dropNote = (d: { malformed: number, badTimes: string[] }) => [
  d.malformed && `${d.malformed} malformed`,
  d.badTimes.length && `${d.badTimes.length} with unreadable time ${d.badTimes.slice(0, 3).join(', ')}${d.badTimes.length > 3 ? ', …' : ''}`,
].filter(Boolean).join('; ')

export function extractCandidates(doc: { id: string, filename: string, title: string, text: string, names?: string[] }) {
  let dropped = ''
  return traced('extract', { type: 'document', id: doc.id }, [doc.id], null, async (): Promise<CandidateDraft[]> => {
    if (modelInfo().mode === 'mock') return (await recordedCandidates(doc.text)) ?? []
    const out = await chatJson(
      `You extract narrative canon candidates from story documents (a game's lore and scripts, a series' episodes, a novel's chapters) for a canon tracker that keeps a story world consistent. Return only JSON {"candidates":[...]}.
Each candidate: {"kind":"character|location|relationship|event|rule|claim","subject":"short entity name","subject_type":"character|location|item|faction|event|other|none","predicate":"snake_case verb","object":"entity name or null","object_type":"character|location|item|faction|event|other|none, or null when object is null","value":"number for measurable rules (e.g. travel minutes), the answer of a single-valued detail, or null","statement":"one plain sentence","quote":"EXACT verbatim substring of the document that supports it","time":{"from":"D<day> HH:MM","to":"D<day> HH:MM","precision":"exact|approximate"} or omitted,"confidence":0-1}.
kind is exactly one of those six words (a "located_at" fact is kind "event").
What to extract: facts a writer must keep consistent — who someone is, where someone is and when, what they do in the plot, relationships, world rules, travel times, what items and places do. In scenes, include each plot action a character takes (what they do, say or refuse, and when), because actions are what world rules are checked against. Skip mood, looks, scenery and trivia. One candidate per fact; do not restate the same fact twice.
Quotes: copy one contiguous span character-for-character, keeping the document's capitalisation and punctuation. A quote never spans two paragraphs, never skips words and never joins separate sentences; when speech is broken by "she says" or similar, quote one side of it only. Prefer the single sentence that supports the fact.
Names: subject and object are names or short nouns, never a clause or a sentence ("Drebber", not "the man was not old"). A character is named the way the story itself names them most often, the same way in every fact: often the first name without rank ("Captain Mara Vell" → "Mara"), or the surname when that is what the story uses ("Holmes"); keep a title that is part of the name everyone uses ("Old Tobin", "Mother Hale"). When a list of names this project already uses is given, reuse those exact names. A place is named as the text names it, without "the", and as the named place rather than a part of it ("Harbour Gate", not "the stairs of the Harbour Gate"). The object is a bare entity name.
Name types: subject_type and object_type say what the name is, for the story's wiki. character = a person or creature with a name (or a named role the story treats as one, "the Lamplighter"); location = a named place; item = a named or unique object; faction = a group, regiment, family, order or company; event = a named event ("the Battle of Maiwand"); other = something else with its own identity. none = not a name at all: a description, a role, a substance, a body part, an activity or a common thing ("first-class chemist", "poisons", "his finger", "rooms with Watson", "violin-playing"). Give the same name the same type every time.
Predicates:
- "located_at": a character is at a place on a story day (object = the place). Use it whenever the text puts someone somewhere on a given day, even if the sentence is about what they do there.
- "travel_time": how long a journey takes; subject = start place only, object = destination only, value = minutes as a number, kind "rule" (e.g. {"kind":"rule","subject":"Harbour Gate","predicate":"travel_time","object":"Lighthouse","value":30}).
- "rule": a law of the world that holds for anyone and that a story event could break (a curse, the cost of a ritual or magic, what a magical item or place does to people). kind "rule", predicate "rule", subject = the thing the rule is about, statement = the rule as written. Customs, opening hours, a character's habit, choice or order are claims, not rules.
- Relationships (kind "relationship"): one predicate per bond, the same one every time it appears (e.g. "sworn_to"), with the same subject and object (for a two-way bond such as partners or siblings, the two names in alphabetical order). A bond that ended gets time.to = when it ended; a bond stated as active at a time gets time.from = that time.
- "is" only with an object that says what the subject is (e.g. "keeper of the Solen Lighthouse").
- Single-valued details: whenever the text states, even in passing, a detail that can have only one answer at a time — where someone's wound or scar is, eye or hair colour, age, first or full name, year or place of birth, who someone's spouse, landlord or employer is, whether someone is alive or dead, what a place or ship is called — make it its own candidate with predicate "<detail>_is" (snake_case, the plain general name of the detail: "wound_location_is", "first_name_is", "eye_colour_is", "spouse_is"), value = the answer in a few of the text's own words, object null, never "has" or "is". Examples: "the sabre cut on her left arm still ached" → {"kind":"character","subject":"Mara","predicate":"wound_location_is","value":"left arm","statement":"Mara's wound is in her left arm."}; "her husband, Tom Vell" → {"subject":"Mara","predicate":"spouse_is","value":"Tom Vell"}. Name the same detail the same way every time it comes up, so answers from different documents can be compared. A detail that changes during the story gets the time it holds. Never use "_is" for something that can have several answers at once (skills, friends, possessions). A state that something goes into during the story (an injury it takes, a voice it loses, a part that breaks, a mood) is an event with its time, not an "_is" detail; keep "_is" for a detail the text gives as simply how things are (where an old wound is, eye colour, a name).
Time: only for facts that happen on a stated story day ("on Day 3", "D-3650"). Identities, traits, rules, background and daily routines ("every evening", "at eight each day") get no time. "D<day> HH:MM" when the text gives a clock time (precision "exact"). When it names only a part of the day ("at dusk", "around evening") use precision "approximate" with a range covering that part of the day. Otherwise use day-only "D<day>" (never 00:00-23:59, never a guessed range). Days before D1 are D0, D-1, D-3650 ….
Do not invent facts. Figurative language ("my sister in all but blood") is NOT a literal relationship; skip it or give it low confidence.`,
      `${doc.names?.length ? `Names this project already uses (write a name exactly like this when the document means the same one; other names it goes by follow "="):\n${doc.names.join('\n')}\n\n` : ''}Document: ${doc.title}\n\n${doc.text}`,
      { reasoningEffort: String(useRuntimeConfig().extractReasoningEffort || 'low') },
    )
    const { kept, ...bad } = cleanCandidates(out.candidates)
    dropped = dropNote(bad)
    return kept
  }, r => `${plural(r.length, 'candidate')}${dropped ? ` (dropped: ${dropped})` : ''}`)
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
      // The recorded checks of the sample the rule is cited from (its evidence, prior sources included), and no other.
      const hashes = useDb().prepare('select distinct d.sha256 from evidence e join documents d on d.id = e.document_id where e.fact_id = ?').all(rule.id) as { sha256: string }[]
      const map = await recordedSources()
      const set = hashes.map(h => map.get(h.sha256)?.set).find(Boolean)
      const runs = set ? (await useStorage('assets:server').getItem<{ rule_contains: string, violations: { statement: string, rationale: string, confidence: number }[] }[]>(`${set}:rule-checks.json`)) ?? [] : []
      const run = runs.find(r => rule.statement.includes(r.rule_contains))
      return (run?.violations ?? []).flatMap((v) => {
        const fact = facts.find(f => f.statement === v.statement)
        return fact ? [{ fact_id: fact.id, rationale: v.rationale, confidence: v.confidence }] : []
      })
    }
    const out = await chatJson(
      `You check a story's world rule against its accepted facts. Return JSON {"violations":[{"fact_id":"...","breaks_rule":true,"rationale":"one sentence: what in the fact contradicts the rule","confidence":0-1}]}.
Each fact's subject and object are the canonical entity names; names listed under "Same entity" refer to one entity.
A fact breaks the rule only when the fact and the rule cannot both be true: the situation the rule covers happened (for example, the act it is about was done), and the fact shows something the rule says cannot follow. A fact that is consistent with the rule, that is about a time or case the rule does not cover, that only mentions the same thing, or that needs extra assumptions to clash is not a violation: leave it out. If you are unsure, leave it out.
Return {"violations":[]} if none.`,
      input,
    )
    const ids = new Set(facts.map(f => f.id))
    return (Array.isArray(out.violations) ? out.violations as (RuleViolation & { breaks_rule?: boolean })[] : [])
      .filter(v => ids.has(v.fact_id) && v.breaks_rule !== false).map(({ fact_id, rationale, confidence }) => ({ fact_id, rationale, confidence }))
  }, r => plural(r.length, 'violation'))
}

// The Critic: a second model reading of verified candidates before a person decides (server/utils/critic.ts builds the items).
// Each item is a pending candidate whose quote is verbatim in its passage, the passage itself, and the accepted canon about
// the same names (for duplicates). It returns opinions only; cleanOpinions (shared/utils/review.ts) drops any that don't hold
// together and turns a "needs edit" that changes none of the fields conflicts and impact read into a keep. Recorded mode
// replays the opinions recorded for a sample's own text (critic.json of the set whose document the candidate cites, by
// statement), and nothing for any other text.
export interface CriticItem extends PromptFact {
  kind: string, value: string | null, time_label: string | null, quote: string, passage: string, before: string[], after: string[], source: string, sha256: string
  canon: (PromptFact & { time_label: string | null })[]
}
const indent = (text: string) => text.split('\n').map(l => `    ${l}`).join('\n')
type RecordedOpinion = Omit<CriticDraft, 'fact_id' | 'verdict' | 'reason'> & { verdict: string, reason: string }
// NUXT_CRITIC_MODEL_ID: the Critic can run on another model than extraction (e.g. muse-wonder-1.0); empty = NUXT_MODEL_ID.
export const criticModelId = () => { const c = useRuntimeConfig(); return modelInfo().mode === 'mock' ? modelInfo().id : (c.criticModelId || c.modelId) }
const str = { type: 'string' }
const orNull = { type: ['string', 'null'] }
// Built on call, not at import: scripts import this file without Nuxt's auto-imports.
const criticSchema = () => ({ name: 'critic_opinions', schema: {
  type: 'object', additionalProperties: false, required: ['opinions'],
  properties: { opinions: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['id', 'statement', 'verdict', 'reason', 'duplicate_of', 'explanation', 'suggestion'],
    properties: {
      id: str, statement: str, verdict: { type: 'string', enum: Object.keys(CRITIC_VERDICTS) }, reason: { type: 'string', enum: Object.keys(CRITIC_REASONS) },
      duplicate_of: orNull, explanation: str,
      suggestion: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['statement', 'subject', 'predicate', 'object', 'time'],
        properties: { statement: str, subject: str, predicate: str, object: orNull, time: orNull } }] },
    },
  } } },
} })
const CRITIC_PROMPT = `You are the Critic: a second, careful reader of fact candidates that another model extracted from a story's source documents. A person decides on each candidate after reading your opinion; you change nothing.
For each candidate you get its statement and structured fields, its quote (already checked to appear word for word in the passage), the passage it comes from (marked >>> <<<, with the paragraphs just around it for context such as the scene's place and day), and the accepted canon facts about the same names.
Return only JSON {"opinions":[{"id":"<candidate id>","statement":"<the candidate's statement, copied exactly>","verdict":"keep|reject|needs_edit","reason":"figurative|not_stated|ambiguous_time_place|duplicate|wrong_subject|ok","duplicate_of":"<canon fact id> or null","explanation":"one short sentence about this candidate only","suggestion":{"statement":"...","subject":"...","predicate":"...","object":"... or null","time":"... or null"} or null}]} with one opinion per candidate, in the order given. Judge each candidate on its own: its explanation talks about its own statement and passage, never another candidate's.
Keep is the normal verdict. Most candidates are fine. Flag one only for these reasons:
- figurative (reject): the passage uses a figure of speech or a manner of speaking (for example "my sister in all but blood", "a sister of the road", "he was a lion") and the candidate reads it as literal fact.
- not_stated (reject): the passage does not make the core claim (who does or is what, to whom, where, when) at all; the candidate invents it, or says the opposite. If the quote itself says it, it is stated, even when notes around it discuss details, open questions or how a game should show it. A fair summary of what the quote means in its scene is stated (someone who answers a request with "the door stays shut" refuses it). A linking clause the statement adds from the wider story ("after ringing the bell", "because she promised") is wording, not a reason to reject.
- duplicate (reject): one of the accepted canon facts listed for this candidate already says the same thing (same people, same relation, same place and time); give its id in duplicate_of.
- wrong_subject (needs_edit): the fact is true of someone or something other than its subject or object.
- ambiguous_time_place (needs_edit): the candidate's time or place is wrong, or more precise than the passage allows.
needs_edit is only for a wrong structured field that conflict and impact checks read: subject, predicate, object (a person or place), time, or when a relationship ends. Its suggestion fixes that field and copies every other field exactly as the candidate has it. A field is wrong only when it names someone or something the fact is not about, or a time or place the passage contradicts; an object that is a party to the fact (the person a refusal answers, the other speaker in a dialogue, the place where it happens) is right. Never use needs_edit for wording, style, a predicate label that means the same, or a detail the statement adds or leaves out: if the fields are right, keep it.
The suggestion's time uses the candidate's format: "D3 14:00", "D3" for some time that day, "D3 14:00 – D3 16:00" for a range, a leading "~ " when approximate, or null for no time. A suggestion never contains a quote. keep and reject have suggestion null; keep always has reason ok, and the other verdicts never do.
Do not flag:
- paraphrase or wording; details the candidate leaves out;
- which of the statement's parties is the object: when it names a person and a place or thing ("refuses the stranger" or "refuses the gate", "travels with her cousin" or "to the city"), either is right;
- plain restatements: someone who walks to, arrives at, enters or stands at a place at a time "is at" that place then; "takes" and "steals"; "Day 3" and "D3";
- a name the story uses for the same thing: a full or short name ("the Guard" for the Pass Guard, "the bridge" or "it" for the bridge the scene is about), the town, abbey or place the scene is set in, even when this passage only says "the town" or "the abbey";
- a reasonable reading of the passage with its context (who "he" is, where a scene happens, why someone acts);
- design notes, codex entries, gameplay notes and lore documents: they are sources like any scene, and what they state is stated.
If you are unsure, keep it; the person still reads every candidate. Judge only from the passage, its context and the canon given; never use outside knowledge. Each subject and object is a canonical entity name; names listed under "Same entity" refer to one entity.`
// A batch flag its rereads didn't confirm is stored as no opinion; this leaves the reason in the trace.
export const noteCriticUnconfirmed = (factId: string, why: string) =>
  traced('critic', { type: 'fact', id: factId }, [factId], null, async () => [] as CriticDraft[], () => `no opinion stored (${why})`, criticModelId())
// reasoning: the reasoning_effort sent on live calls (criticReasoning in critic.ts); it and the tokens used go in the trace.
export function critiqueCandidates(items: CriticItem[], reasoning: string) {
  const asked = new Map(items.map(i => [i.id, { ...i, canon: new Set(i.canon.map(f => f.id)), text: [...i.before, i.passage, ...i.after].join('\n') }]))
  const canonLines = (facts: CriticItem['canon']) => facts.map(f => `[${f.id}] ${f.statement}\n  subject: ${f.subject}; predicate: ${f.predicate}; object: ${f.object ?? '-'}; time: ${f.time_label ?? '-'}`).join('\n')
  const input = items.map(i => [
    `[${i.id}] ${i.statement}`,
    `  kind: ${i.kind}; subject: ${i.subject}; predicate: ${i.predicate}; object: ${i.object ?? '-'}; value: ${i.value ?? '-'}; time: ${i.time_label ?? '-'}`,
    `  quote: "${i.quote}"`,
    `  passage (${i.source}):\n${indent([...i.before, `>>> ${i.passage} <<<`, ...i.after].join('\n\n'))}`,
    i.canon.length ? `  accepted canon about the same names:\n${indent(canonLines(i.canon))}` : '  accepted canon about the same names: none',
  ].join('\n')).join('\n\n') + identityNotes(items.flatMap(i => [i, ...i.canon]))
  let dropped: string[] = []
  let softened = 0
  let usage: ChatUsage | undefined
  const target = items.length === 1 ? { type: 'fact', id: items[0]!.id } : { type: 'batch', id: newId('crit') }
  return traced('critic', target, items.map(i => i.id), input, async (): Promise<CriticDraft[]> => {
    let raw: unknown
    if (modelInfo().mode === 'mock') {
      const map = await recordedSources()
      const files = new Map<string, Record<string, RecordedOpinion> | null>()
      const recorded = async (set: string) => {
        if (!files.has(set)) files.set(set, await useStorage('assets:server').getItem<Record<string, RecordedOpinion>>(`${set}:critic.json`))
        return files.get(set)
      }
      raw = (await Promise.all(items.map(async (i) => {
        const set = map.get(i.sha256)?.set
        const o = set ? (await recorded(set))?.[i.statement] : undefined
        return o ? [{ ...o, id: i.id, statement: i.statement }] : []
      }))).flat()
    } else {
      raw = (await chatJson(CRITIC_PROMPT, input, { schema: criticSchema(), model: criticModelId(), reasoningEffort: reasoning, onUsage: (u) => { usage = u } })).opinions
    }
    const out = cleanOpinions(raw, asked)
    dropped = out.why
    softened = out.softened
    return out.kept
  }, r => `${plural(r.length, 'opinion')} on ${plural(items.length, 'candidate')}${dropped.length ? ` (dropped ${dropped.length}: ${dropped.join(', ')})` : ''}${softened ? ` (${softened} wording-only edits read as keep)` : ''}${modelInfo().mode === 'mock' ? '' : ` · reasoning effort ${reasoning}${usage?.completion_tokens != null ? `, ${usage.completion_tokens} output tokens (${usage.completion_tokens_details?.reasoning_tokens ?? '?'} reasoning)` : ''}`}`, criticModelId(), modelInfo().mode === 'mock' ? null : reasoning)
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

// Muse Voice Transcribe (dev.meta.ai/docs/speech-to-text): POST {base}/asr/transcribe, multipart with a `request` JSON part
// and an `audio` WAV part. Not the OpenAI /audio/transcriptions shape. ENDPOINTING mode returns model-detected turns with
// start/end times (PUSH_TO_TALK returns none; DIARIZATION adds speaker labels but gave coarser turns in our tests, so it is
// an option: NUXT_TRANSCRIBE_MODE). Timestamps are per turn; there are no word timestamps.
// NUXT_TRANSCRIBE_API=openai talks to an OpenAI-style /audio/transcriptions stand-in instead (a test bridge, not Muse).
export function transcribeModelInfo() {
  const { modelMode, transcribeModelId } = useRuntimeConfig()
  return { live: modelMode === 'meta', id: modelMode === 'meta' ? transcribeModelId : 'mock:recorded-fixtures' }
}

// Sample recordings with a recorded transcript (server/assets/<set>/recordings.json): the audio's sha256 picks the entry,
// so only that exact sample file gets a transcript in recorded mode; any other audio is refused, never given made-up text.
export interface RecordedRecording { set: string, file: string, audio_sha256: string, script?: string, duration_ms: number, session_id?: string, turns: Turn[], candidates?: CandidateDraft[] }
let recordings: Promise<RecordedRecording[]> | undefined
const recordedRecordings = () => recordings ??= (async () => {
  const out: RecordedRecording[] = []
  for (const set of RECORDED_SETS) {
    const list = await useStorage('assets:server').getItem<Omit<RecordedRecording, 'set'>[]>(`${set}:recordings.json`)
    for (const r of list ?? []) out.push({ ...r, set })
  }
  return out
})()

export interface Transcript { turns: Turn[], duration_ms: number, session_ids: string[], mode: string }
type MuseTranscript = { sessionId?: string, transcript?: string, audioDurationMs?: number, turns?: { startMs?: number, endMs?: number, transcript?: string, speaker?: string }[] }

async function transcribeChunk(file: Buffer, durationMs: number, keywords: string[]): Promise<{ turns: Turn[], session_id: string | null }> {
  const { metaBaseUrl, metaApiKey, transcribeBaseUrl, transcribeApiKey, transcribeModelId, transcribeMode, transcribeApi } = useRuntimeConfig()
  const key = transcribeApiKey || metaApiKey
  if (!key) throw createError({ statusCode: 503, statusMessage: 'MODEL_NOT_CONFIGURED', message: 'The AI provider key is not set (NUXT_META_API_KEY).' })
  const base = transcribeBaseUrl || metaBaseUrl
  const form = new FormData()
  const audio = new Blob([new Uint8Array(file)], { type: 'audio/wav' })
  const fail = (e: Parameters<typeof apiFailure>[0]) => apiFailure(e, 'Transcription failed', 'No transcript was saved.')
  if (transcribeApi === 'openai') {
    form.append('file', audio, 'audio.wav')
    form.append('model', transcribeModelId)
    form.append('response_format', 'verbose_json')
    if (keywords.length) form.append('prompt', keywords.join(', '))
    const r = await $fetch<{ text?: string, segments?: { start: number, end: number, text: string }[] }>(`${base}/audio/transcriptions`, {
      method: 'POST', body: form, timeout: 300_000, headers: { Authorization: `Bearer ${key}` },
    }).catch((e) => { throw fail(e) })
    const segs = r.segments?.length ? r.segments : r.text ? [{ start: 0, end: durationMs / 1000, text: r.text }] : []
    return { turns: segs.map(s => ({ start_ms: Math.round(s.start * 1000), end_ms: Math.round(s.end * 1000), text: s.text, speaker: null })), session_id: null }
  }
  form.append('request', new Blob([JSON.stringify({ model: transcribeModelId, audioEncoding: 'WAV', mode: transcribeMode, ...(keywords.length && { keywords }) })], { type: 'application/json' }))
  form.append('audio', audio, 'audio.wav')
  const r = await $fetch<MuseTranscript>(`${base}/asr/transcribe`, {
    method: 'POST', body: form, timeout: 300_000, headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  }).catch((e) => { throw fail(e) })
  if (!r || typeof r !== 'object' || (r.turns !== undefined && !Array.isArray(r.turns)))
    throw createError({ statusCode: 502, statusMessage: 'MODEL_BAD_OUTPUT', message: 'Transcription failed: Muse Voice Transcribe did not return a transcript. No transcript was saved.' })
  const turns = (r.turns ?? []).filter(t => typeof t?.transcript === 'string')
    .map(t => ({ start_ms: Number(t.startMs) || 0, end_ms: Number(t.endMs) || 0, text: t.transcript!, speaker: typeof t.speaker === 'string' ? t.speaker : null }))
  // PUSH_TO_TALK (or a single utterance) can come back without turns: the whole clip is then one turn.
  if (!turns.length && r.transcript?.trim()) turns.push({ start_ms: 0, end_ms: Number(r.audioDurationMs) || durationMs, text: r.transcript, speaker: null })
  return { turns, session_id: r.sessionId ?? null }
}

/** Speech to text for one WAV (from toMuseWav). Longer than CHUNK_MS goes in chunks whose turn times are shifted back into
 * place. Counted against the hourly audio limits first (spendAudio). Recorded in model_calls (purpose `transcribe`, the audio's sha256 as input ref); a failure is shown, never filled in. */
export function transcribeAudio(wav: Wav & { sha256: string }, target: { type: string, id: string }) {
  const info = transcribeModelInfo()
  spendAudio(target.type === 'dictation' ? 'dictation' : 'recording', wav.duration_ms)
  return traced('transcribe', target, [wav.sha256], null, async (): Promise<Transcript> => {
    if (!info.live) {
      const rec = (await recordedRecordings()).find(r => r.audio_sha256 === wav.sha256)
      if (!rec) throw createError({ statusCode: 503, statusMessage: 'MODEL_OFFLINE', message: 'Transcription isn’t available in this workspace yet: only the sample recording has a transcript. Nothing was saved.' })
      return { turns: rec.turns, duration_ms: rec.duration_ms, session_ids: rec.session_id ? [rec.session_id] : [], mode: 'recorded' }
    }
    const keywords = transcriptionKeywords()
    const turns: Turn[] = []
    const sessions: string[] = []
    for (const c of wavChunks(wav)) {
      const r = await transcribeChunk(c.file, Math.min(CHUNK_MS, wav.duration_ms - c.offset_ms), keywords)
      turns.push(...r.turns.map(t => ({ ...t, start_ms: t.start_ms + c.offset_ms, end_ms: t.end_ms + c.offset_ms })))
      if (r.session_id) sessions.push(r.session_id)
    }
    return { turns, duration_ms: wav.duration_ms, session_ids: sessions, mode: useRuntimeConfig().transcribeMode }
  }, r => `${plural(r.turns.length, 'turn')}, ${Math.round(r.duration_ms / 1000)} s of audio`, info.id)
}
