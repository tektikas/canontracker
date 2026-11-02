import { createHash } from 'node:crypto'
import type { Turn, Wav } from './audio'

// All model calls go through here. MODEL_MODE=mock replays recorded fixture output;
// MODEL_MODE=meta calls the Meta Model API (OpenAI-compatible). The key never leaves the server.
// Every call, mock or live, is written to model_calls so the UI can show what the model was asked and with which sources.

export interface CandidateDraft {
  kind: string, subject: string, predicate: string, object?: string | null, value?: string | null, statement: string, quote: string
  time?: { from?: string, to?: string, precision?: 'exact' | 'approximate' }
  confidence?: number
}

export interface RuleViolation { fact_id: string, rationale: string, confidence: number }

export const PROMPT_VERSIONS = { extract: 'extract-v2', answer: 'answer-v2', rule_check: 'rule-check-v3', image: 'image-v1', transcribe: 'transcribe-v1' } as const

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

// The demo sets with a recorded run. Recorded output is replayed only for a sample's own text: the sha256 of the imported
// content must equal the sha256 of one of the set's source files (docs/ or v2/). A file that merely shares a sample's name
// gets nothing, so an unrelated upload never receives another story's candidates.
const RECORDED_SETS = ['broken-tide', 'ashbell-pass']
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
    return [{ kind, subject, predicate, object: field(c.object) || null, value: field(c.value) || null, statement, quote, confidence,
      ...(t && (t.from || t.to) && { time: { ...t, precision: c.time.precision === 'approximate' ? 'approximate' : 'exact' } }) }]
  })
  return { kept, malformed: list.length - kept.length - badTimes.length, badTimes }
}
const dropNote = (d: { malformed: number, badTimes: string[] }) => [
  d.malformed && `${d.malformed} malformed`,
  d.badTimes.length && `${d.badTimes.length} with unreadable time ${d.badTimes.slice(0, 3).join(', ')}${d.badTimes.length > 3 ? ', …' : ''}`,
].filter(Boolean).join('; ')

export function extractCandidates(doc: { id: string, filename: string, title: string, text: string }) {
  let dropped = ''
  return traced('extract', { type: 'document', id: doc.id }, [doc.id], null, async (): Promise<CandidateDraft[]> => {
    if (modelInfo().mode === 'mock') return (await recordedCandidates(doc.text)) ?? []
    const out = await chatJson(
      `You extract narrative canon candidates from game lore documents for a story bible that tracks continuity. Return only JSON {"candidates":[...]}.
Each candidate: {"kind":"character|location|relationship|event|rule|claim","subject":"short entity name","predicate":"snake_case verb","object":"entity name or null","value":"number for measurable rules (e.g. travel minutes) or null","statement":"one plain sentence","quote":"EXACT verbatim substring of the document that supports it","time":{"from":"D<day> HH:MM","to":"D<day> HH:MM","precision":"exact|approximate"} or omitted,"confidence":0-1}.
kind is exactly one of those six words (a "located_at" fact is kind "event").
What to extract: facts a writer must keep consistent — who someone is, where someone is and when, what they do in the plot, relationships, world rules, travel times, what items and places do. In scenes, include each plot action a character takes (what they do, say or refuse, and when), because actions are what world rules are checked against. Skip mood, looks, scenery and trivia. One candidate per fact; do not restate the same fact twice.
Quotes: copy one contiguous span character-for-character, keeping the document's capitalisation and punctuation. A quote never spans two paragraphs, never skips words and never joins separate sentences; when speech is broken by "she says" or similar, quote one side of it only. Prefer the single sentence that supports the fact.
Names: a character is named the way the story names them for short, the same way in every fact: usually the first name without rank or surname ("Captain Mara Vell" → "Mara"), but keep a title that is part of the name everyone uses ("Old Tobin", "Mother Hale"). A place is named as the text names it, without "the", and as the named place rather than a part of it ("Harbour Gate", not "the stairs of the Harbour Gate"). The object is a bare entity name.
Predicates:
- "located_at": a character is at a place on a story day (object = the place). Use it whenever the text puts someone somewhere on a given day, even if the sentence is about what they do there.
- "travel_time": how long a journey takes; subject = start place only, object = destination only, value = minutes as a number, kind "rule" (e.g. {"kind":"rule","subject":"Harbour Gate","predicate":"travel_time","object":"Lighthouse","value":30}).
- "rule": a law of the world that holds for anyone and that a story event could break (a curse, the cost of a ritual or magic, what a magical item or place does to people). kind "rule", predicate "rule", subject = the thing the rule is about, statement = the rule as written. Customs, opening hours, a character's habit, choice or order are claims, not rules.
- Relationships (kind "relationship"): one predicate per bond, the same one every time it appears (e.g. "sworn_to"), with the same subject and object (for a two-way bond such as partners or siblings, the two names in alphabetical order). A bond that ended gets time.to = when it ended; a bond stated as active at a time gets time.from = that time.
- "is" only with an object that says what the subject is (e.g. "keeper of the Solen Lighthouse").
Time: only for facts that happen on a stated story day ("on Day 3", "D-3650"). Identities, traits, rules, background and daily routines ("every evening", "at eight each day") get no time. "D<day> HH:MM" when the text gives a clock time (precision "exact"). When it names only a part of the day ("at dusk", "around evening") use precision "approximate" with a range covering that part of the day. Otherwise use day-only "D<day>" (never 00:00-23:59, never a guessed range). Days before D1 are D0, D-1, D-3650 ….
Do not invent facts. Figurative language ("my sister in all but blood") is NOT a literal relationship; skip it or give it low confidence.`,
      `Document: ${doc.title}\n\n${doc.text}`,
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
  if (!key) throw createError({ statusCode: 503, statusMessage: 'MODEL_NOT_CONFIGURED', message: 'Meta Model API key is not set (NUXT_META_API_KEY).' })
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
 * place. Recorded in model_calls (purpose `transcribe`, the audio's sha256 as input ref); a failure is shown, never filled in. */
export function transcribeAudio(wav: Wav & { sha256: string }, target: { type: string, id: string }) {
  const info = transcribeModelInfo()
  return traced('transcribe', target, [wav.sha256], null, async (): Promise<Transcript> => {
    if (!info.live) {
      const rec = (await recordedRecordings()).find(r => r.audio_sha256 === wav.sha256)
      if (!rec) throw createError({ statusCode: 503, statusMessage: 'MODEL_OFFLINE', message: 'Transcription needs the live AI. In recorded mode only the sample recording has a transcript. Nothing was saved.' })
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
