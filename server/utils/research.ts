// Research mode: real-world questions (science, history, crime, anything) answered from outside sources and deterministic
// calculators, never canon. Contract shared with card c53 (conversations call runResearch). The model plans and cites; we
// run the calculators, fetch every cited page with the SSRF-safe fetcher and check each quoted sentence verbatim (tolerant
// matcher), so a source reads "verified" only when its words are on the page. The result is stored as a research note.
// Nothing here becomes canon: promoting a note makes a pending candidate a person reviews.
import { CALCULATORS } from './calculators/index'
import { researchProfile } from '../../shared/utils/research'
import type { ResearchCalculation, ResearchClaim, ResearchSource, Verdict } from '../../shared/utils/research'

export interface ResearchInput {
  projectId: string
  conversationId: string
  question: string
  // Earlier messages in the conversation, oldest first.
  history: { role: 'user' | 'assistant', mode: 'canon' | 'research', author: string, text: string }[]
  // The chips the asker attached (resolved on the server): the page they were on, a quoted selection.
  context: { type: string, id: string, label: string, quote?: string }[]
  // The project's research profile. null: read it from the project.
  profile: Record<string, string> | null
}
export interface ResearchResult {
  kind: 'answer' | 'followup'
  text: string
  noteIds?: string[]
  followup?: { question: string, options?: string[] }
}

export interface ResearchNote {
  id: string, question: string, answer: string, verdict: Verdict, why: string, claims: ResearchClaim[], sources: ResearchSource[]
  calculations: ResearchCalculation[], searches: string[], model_id: string, prompt_version: string, recorded: number
  conversation_id: string | null, created_by: string, created_by_name: string, created_at: string, document_id: string | null
  pin_document_id: string | null, pin_passage_id: string | null, pin_quote: string | null, pinned_by_name: string | null, pinned_at: string | null
  pin_document_title: string | null, pin_line: number | null
}

const INSTRUCTIONS = `You are the research assistant inside Story Bible, where writers and game teams build story worlds. You answer real-world questions (science, engineering, history, crime and forensics, geography, culture, anything) so a writer can judge what is real or plausible. You never answer about the writer's own story: that is their canon, not your job.

How to work:
- Use web_search to find reliable sources (agencies, universities, museums, encyclopedias, peer-reviewed work, primary records). Search more than once when one source isn't enough.
- Use the calculator functions for every number they can compute (travel time at constant acceleration, Hohmann transfers, rocket Δv, light delay, surface gravity, radiation dose scaling, weekday, Julian/Gregorian conversion, age at a date, moon phase, sunrise/sunset, travel by period means of transport, time since death). Never do that arithmetic yourself. Pass full numbers (628 million km is 628000000), check the tool's result is for what you meant, and report the tool's numbers and its assumptions. If a result looks wrong, call the tool again with corrected arguments.
- Every factual claim needs a source you found, with a quote: one sentence copied character for character from that page. Do not paraphrase inside a quote and do not quote a search snippet you have not seen on the page. If you have no source for a claim, mark its basis "model".
- Give a verdict: "established" (well documented or computed), "speculative" (plausible but not established), "contradicts" (against known science or history), "unknown" (the evidence isn't there or it can't be known). When it can't be known, say so plainly; never fill the gap.
- If the question lacks something essential (which ship or engine, which period, which place, which body), don't guess: ask one follow-up question with 1–3 short options.
- Anachronism checks: list each object, word, technology or institution that is out of period, with when it actually appeared and a source.
- Time of death: always a range from the time_since_death tool, with its assumptions; it is fiction research, not forensic advice. A computed range under stated assumptions is an answer ("established" for those assumptions), not "unknown".
- Use the research profile (field, period, place, legal system) when the question leaves them open.

Your final message is ONLY a JSON object, no prose around it:
{"kind":"answer","verdict":"established|speculative|contradicts|unknown","answer":"2-6 plain sentences answering the question, numbers included","why":"one sentence: why this verdict","claims":[{"text":"one claim","basis":"source|calculator|model","tool":"calculator name when basis is calculator, else null","sources":[{"url":"https://…","title":"page title","quote":"one exact sentence from the page"}]}]}
or {"kind":"followup","question":"the one thing you need to know","options":["short option","short option"]}`

const VERDICT_KEYS = ['established', 'speculative', 'contradicts', 'unknown'] as const
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const normQ = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// The model's final message is a JSON object; prose around it (or a fenced block) is tolerated, nothing else is.
export function parseFinal(text: string): Record<string, unknown> | null {
  for (let i = text.indexOf('{'); i !== -1; i = text.indexOf('{', i + 1)) {
    try {
      const v = JSON.parse(text.slice(i, text.lastIndexOf('}') + 1))
      if (v && typeof v === 'object' && !Array.isArray(v) && (v.kind === 'answer' || v.kind === 'followup')) return v
    } catch { /* try the next brace */ }
  }
  return null
}

// --- Source checking -----------------------------------------------------------------------------------------------------

const PAGE_MAX_BYTES = 4_000_000
const PAGE_DEADLINE_MS = 20_000
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', shy: '­', deg: '°', middot: '·', times: '×', minus: '−', eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä', ccedil: 'ç', thinsp: ' ', ensp: ' ', emsp: ' ', zwj: '', zwnj: '', laquo: '«', raquo: '»', copy: '©', reg: '®', sup2: '²', sup3: '³', frac12: '½', frac14: '¼', frac34: '¾', plusmn: '±', micro: 'µ', prime: '′', Prime: '″' }
export function htmlToText(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/td|\/th|\/blockquote|\/section|\/article|\/dd|\/dt|hr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z\d]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
      }
      return ENTITIES[e] ?? m
    })
    .replace(/[ \t\f\v ]+/g, ' ')
}

// Analytics parameters are not part of a source's address.
export function cleanUrl(raw: string) {
  try {
    const u = new URL(raw)
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/.test(k)) u.searchParams.delete(k)
    u.hash = ''
    return u.href
  } catch {
    return ''
  }
}

type Page = { text: string } | { pdf: true } | { error: string }
async function fetchPage(url: string): Promise<Page> {
  if (/\.pdf$/i.test(new URL(url).pathname)) return { pdf: true } // not downloaded: no PDF text extraction (see checkSources)
  const signal = AbortSignal.timeout(PAGE_DEADLINE_MS)
  try {
    const res = await safeGet(url, PAGE_MAX_BYTES, signal, { accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5', what: 'the page', agent: 'Mozilla/5.0 (compatible; StoryBible research source check)' })
    if (/pdf/i.test(res.contentType) || res.body.subarray(0, 5).toString('latin1') === '%PDF-') return { pdf: true }
    const charset = res.contentType.match(/charset=([\w-]+)/i)?.[1]
    let text: string
    try {
      text = new TextDecoder(charset || 'utf-8').decode(res.body)
    } catch {
      text = new TextDecoder('utf-8').decode(res.body)
    }
    return { text: /html|xml/i.test(res.contentType) || /^\s*</.test(text) ? htmlToText(text) : text }
  } catch (e) {
    const err = e as Error
    return { error: signal.aborted ? 'the page took too long to load' : err.message }
  }
}

/** Fetches each cited page once and checks every quote on it, verbatim under typography folding. PDFs are marked
 * "not text-checked": extracting their text needs a heavy dependency, so they are neither fetched nor called verified. */
export async function checkSources(cited: { url: string, title: string, quote: string }[]): Promise<ResearchSource[]> {
  const urls = [...new Set(cited.map(c => c.url))]
  const pages = new Map(await Promise.all(urls.map(async u => [u, await fetchPage(u)] as const)))
  return cited.map((c, i) => {
    const page = pages.get(c.url)!
    const base = { n: i + 1, url: c.url, title: c.title, quote: c.quote }
    if ('pdf' in page) return { ...base, status: 'not_checked' as const, reason: 'PDF: source not text-checked' }
    if ('error' in page) return { ...base, status: 'unverified' as const, reason: `The page could not be read (${page.error}).` }
    if (!c.quote) return { ...base, status: 'unverified' as const, reason: 'No quote was given for this source.' }
    return quoteMatches(page.text, c.quote).length
      ? { ...base, status: 'verified' as const, reason: null }
      : { ...base, status: 'unverified' as const, reason: 'The quoted sentence is not on the page.' }
  })
}

// --- The run -------------------------------------------------------------------------------------------------------------

export function projectResearchProfile(projectId: string) {
  const row = useDb().prepare('select research_profile from projects where id = ?').get(projectId) as { research_profile: string } | undefined
  return researchProfile(row?.research_profile)
}

function composeInput(i: ResearchInput, profile: Record<string, string>) {
  const p = Object.entries(profile).filter(([, v]) => v).map(([k, v]) => `${k.replace('_', ' ')}: ${k === 'field' ? RESEARCH_FIELDS[v as keyof typeof RESEARCH_FIELDS] ?? v : v}`)
  const history = i.history.slice(-8).map(h => `- ${h.role === 'user' ? h.author || 'user' : 'assistant'} (${h.mode}): ${h.text.slice(0, 1200)}`)
  const context = i.context.map(c => `- ${c.type} "${c.label}"${c.quote ? `: "${c.quote.slice(0, 1500)}"` : ''}`)
  return [
    p.length && `Research profile of this project:\n${p.join('\n')}`,
    history.length && `Earlier in this conversation:\n${history.join('\n')}`,
    context.length && `Attached by the asker:\n${context.join('\n')}`,
    `Question: ${i.question}`,
  ].filter(Boolean).join('\n\n')
}

interface Draft { verdict: Verdict, answer: string, why: string, claims: { text: string, basis: string, tool: string | null, sources: { url: string, title: string, quote: string }[] }[] }

function readDraft(v: Record<string, unknown>): Draft {
  const claims = (Array.isArray(v.claims) ? v.claims : []).slice(0, 20).flatMap((c) => {
    const text = str(c?.text, 600)
    if (!text) return []
    const sources = (Array.isArray(c.sources) ? c.sources : []).slice(0, 4).flatMap((s: Record<string, unknown>) => {
      const url = cleanUrl(str(s?.url, 2000))
      return url ? [{ url, title: str(s.title, 300), quote: str(s.quote, 1200) }] : []
    })
    return [{ text, basis: str(c.basis, 20), tool: str(c.tool, 60) || null, sources }]
  })
  return {
    verdict: VERDICT_KEYS.includes(v.verdict as Verdict) ? v.verdict as Verdict : 'unknown',
    answer: str(v.answer, 4000), why: str(v.why, 1000), claims,
  }
}

// Claims as stored: sources numbered once per (url, quote); a calculator claim only counts when this run called that tool;
// a claim with neither is model knowledge, unverified. `cited` is what still has to be checked, in source-number order.
function numberClaims(d: Draft, calcs: ResearchCalculation[]) {
  const cited: { url: string, title: string, quote: string }[] = []
  const ref = (s: { url: string, title: string, quote: string }) => {
    let k = cited.findIndex(c => c.url === s.url && c.quote === s.quote)
    if (k === -1) k = cited.push(s) - 1
    return k + 1
  }
  const ran = new Set(calcs.filter(c => !c.error).map(c => c.name))
  const claims: ResearchClaim[] = d.claims.map((c) => {
    const sources = c.sources.map(ref)
    const tool = c.tool && ran.has(c.tool) ? c.tool : null
    const basis = c.basis === 'calculator' && tool ? 'calculator' : sources.length ? 'source' : tool ? 'calculator' : 'model'
    return { text: c.text, basis, sources, tool }
  })
  return { claims, cited }
}

const VERDICT_TEXT: Record<Verdict, string> = { established: 'Established', speculative: 'Plausible but speculative', contradicts: 'Contradicts known science or history', unknown: 'Unknown' }
function summaryText(n: { verdict: Verdict, answer: string, why: string, sources: ResearchSource[], claims: ResearchClaim[] }) {
  const count = (s: string) => n.sources.filter(x => x.status === s).length
  const tally = [count('verified') && `${count('verified')} verified`, count('unverified') && `${count('unverified')} unverified`, count('not_checked') && `${count('not_checked')} not text-checked`].filter(Boolean)
  const model = n.claims.filter(c => c.basis === 'model').length
  return [`${VERDICT_TEXT[n.verdict]}${n.why ? ` — ${n.why}` : ''}`, n.answer,
    [tally.length ? `Sources: ${tally.join(', ')}.` : 'No sources.', model ? `${model} claim${model === 1 ? '' : 's'} from model knowledge, unverified.` : ''].filter(Boolean).join(' ')].join('\n\n')
}

function storeNote(id: string, i: ResearchInput, n: { question: string, verdict: Verdict, answer: string, why: string, claims: ResearchClaim[], sources: ResearchSource[], calculations: ResearchCalculation[], searches: string[] }, model: { id: string, recorded: boolean }) {
  tx(() => {
    useDb().prepare(`insert into research_notes (id, question, answer, verdict, why, claims, sources, calculations, searches, model_id, prompt_version,
      recorded, conversation_id, created_by, created_at, project_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, n.question, n.answer, n.verdict, n.why, JSON.stringify(n.claims), JSON.stringify(n.sources), JSON.stringify(n.calculations),
        JSON.stringify(n.searches), model.id, PROMPT_VERSIONS.research, model.recorded ? 1 : 0, i.conversationId || null, access().user.id, now(), i.projectId)
    audit('research.created', 'research_note', id, {
      question: n.question, verdict: n.verdict, conversation_id: i.conversationId || null, model_id: model.id, recorded: model.recorded,
      sources: { verified: n.sources.filter(s => s.status === 'verified').length, total: n.sources.length }, calculations: n.calculations.map(c => c.name),
    })
  })
}

// Recorded runs exist only for the probes (scripts/research-probe.mjs): the question must match one exactly. Calculators
// still run for real; source checks are replayed as recorded (no network). Stored with recorded = 1.
interface Recorded { question: string, kind: 'answer' | 'followup', followup?: { question: string, options: string[] }, draft?: Record<string, unknown>, calculations?: { name: string, args: Record<string, unknown> }[], sources?: { status: ResearchSource['status'], reason: string | null }[], searches?: string[] }

function runCalculator(name: string, args: Record<string, unknown>): ResearchCalculation {
  const tool = CALCULATORS.find(t => t.name === name)
  try {
    if (!tool) throw new Error(`no tool named ${name}`)
    const r = tool.run(args)
    return { name, args, result: r.result, assumptions: r.assumptions, error: null }
  } catch (e) {
    return { name, args, result: null, assumptions: [], error: (e as Error).message }
  }
}

export async function runResearch(input: ResearchInput): Promise<ResearchResult> {
  const question = input.question.trim()
  // A reply to a follow-up ("Use 1 light-year at 1 g") is filed under the question it answers.
  const [asked, followup] = input.history.slice(-2)
  const title = asked?.role === 'user' && followup?.role === 'assistant' && followup.text.trim().endsWith('?') ? `${asked.text.trim()} (${question})` : question
  const profile: Record<string, string> = input.profile ?? { ...projectResearchProfile(input.projectId) }
  const id = newId('rn')
  const target = { type: 'research', id }

  if (modelInfo().mode === 'mock') {
    const fixtures = (await useStorage('assets:server').getItem<Recorded[]>('research:recorded.json')) ?? []
    const rec = fixtures.find(f => normQ(f.question) === normQ(question))
    if (!rec) return { kind: 'answer', text: 'Research runs on the live AI model, which isn’t switched on here, so nothing was looked up. Canon questions still work.' }
    recordStep({ purpose: 'research', target, modelId: 'mock:recorded-fixtures', projectId: input.projectId, step: 0, tool: null, input: composeInput({ ...input, question }, profile),
      status: 'ok', latency: 0, summary: `recorded research run (${rec.kind})`, error: null, tokens: null })
    if (rec.kind === 'followup') return { kind: 'followup', text: rec.followup!.question, followup: rec.followup }
    const calculations = (rec.calculations ?? []).map(c => runCalculator(c.name, c.args))
    const draft = readDraft(rec.draft ?? {})
    const { claims, cited } = numberClaims(draft, calculations)
    const sources = cited.map((c, k) => ({ n: k + 1, ...c, status: rec.sources?.[k]?.status ?? 'unverified', reason: rec.sources?.[k]?.reason ?? 'Recorded run: not checked.' }))
    const note = { question: title, ...draft, claims, sources, calculations, searches: rec.searches ?? [] }
    storeNote(id, input, note, { id: 'mock:recorded-fixtures', recorded: true })
    return { kind: 'answer', text: summaryText(note), noteIds: [id] }
  }

  const run = await runAgent({ purpose: 'research', target, projectId: input.projectId, instructions: INSTRUCTIONS,
    input: composeInput({ ...input, question }, profile), tools: CALCULATORS, webSearch: true, effort: 'high' })
  const out = parseFinal(run.text)
  if (!out) {
    recordStep({ purpose: 'research', target, modelId: modelInfo().id, projectId: input.projectId, step: run.steps, tool: null, input: null, status: 'failed', latency: 0,
      summary: null, error: 'The final message was not the JSON answer.', tokens: null })
    throw createError({ statusCode: 502, statusMessage: 'MODEL_BAD_OUTPUT', message: 'Research failed: the model did not return its answer in the expected form. Nothing was stored.' })
  }
  if (out.kind === 'followup') {
    const q = str(out.question, 500) || 'Can you say a bit more about what you need?'
    const options = (Array.isArray(out.options) ? out.options : []).map(o => str(o, 120)).filter(Boolean).slice(0, 3)
    return { kind: 'followup', text: q, followup: { question: q, ...(options.length && { options }) } }
  }
  const draft = readDraft(out)
  const calculations: ResearchCalculation[] = run.toolCalls
  const { claims, cited } = numberClaims(draft, calculations)
  // Fallback when the JSON names no source at all: the pages the model cited along the way (annotations or URLs in its text)
  // are listed, unattached to any claim; with no quote they read "not verified".
  if (!cited.length)
    for (const c of run.citations) {
      const url = cleanUrl(c.url)
      if (url && !cited.some(x => x.url === url) && cited.length < 8) cited.push({ url, title: c.title, quote: '' })
    }
  const sources = await checkSources(cited)
  const note = { question: title, verdict: draft.verdict, answer: draft.answer, why: draft.why, claims, sources, calculations, searches: run.searches }
  storeNote(id, input, note, { id: modelInfo().id, recorded: false })
  return { kind: 'answer', text: summaryText(note), noteIds: [id] }
}

// --- Reading notes -------------------------------------------------------------------------------------------------------

export function listResearchNotes(where = '1 = 1', ...params: (string | number)[]) {
  const rows = useDb().prepare(`select r.*, cu.name created_by_name, pu.name pinned_by_name, d.title pin_document_title, p.start_line pin_line
    from research_notes r left join users cu on cu.id = r.created_by left join users pu on pu.id = r.pinned_by
    left join documents d on d.id = r.pin_document_id left join passages p on p.id = r.pin_passage_id
    where r.project_id = ? and (${where}) order by r.rowid desc`).all(pid(), ...params) as Record<string, unknown>[]
  return rows.map(r => ({
    ...r, claims: JSON.parse(r.claims as string), sources: JSON.parse(r.sources as string), calculations: JSON.parse(r.calculations as string),
    searches: JSON.parse(r.searches as string),
  })) as ResearchNote[]
}

export function getResearchNote(id: string) {
  const n = listResearchNotes('r.id = ?', id)[0]
  if (!n) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Research note not found.' })
  return n
}

// The read-only document a promoted note's facts cite: the note as written, made once, in the Library's "Research" folder.
// Its text never changes (a note is never edited), so the citation stays verbatim.
export function researchDocumentText(n: ResearchNote) {
  const label = (s: ResearchSource) => s.status === 'verified' ? 'quote verified on the page' : s.status === 'not_checked' ? 'not text-checked (PDF)' : 'quote not verified'
  const basis = (c: ResearchClaim) => c.basis === 'calculator' ? ` (calculated: ${c.tool})` : c.basis === 'model' ? ' (model knowledge, unverified)' : c.sources.length ? ` [${c.sources.join(', ')}]` : ''
  return [
    `# Research: ${n.question}`, '',
    `Verdict: ${VERDICT_TEXT[n.verdict]}.${n.why ? ` ${n.why}` : ''}`, '',
    n.answer, '',
    ...(n.claims.length ? ['## Claims', '', ...n.claims.flatMap(c => [`${c.text}${basis(c)}`, ''])] : []),
    ...(n.sources.length ? ['## Sources', '', ...n.sources.flatMap(s => [`[${s.n}] ${s.title || s.url} — ${s.url} (${label(s)})`, '', ...(s.quote ? [`"${s.quote}"`, ''] : [])])] : []),
    ...(n.calculations.length ? ['## Calculations', '', ...n.calculations.filter(c => !c.error).flatMap(c => [`${c.name}(${JSON.stringify(c.args, null, 1).replace(/\n\s*/g, ' ')}) = ${JSON.stringify(c.result, null, 1).replace(/\n\s*/g, ' ')}`, ''])] : []),
    `Research note ${n.id}, ${n.created_at.slice(0, 10)}. Outside research, not canon until a person accepts a fact citing it.`,
    '',
  ].join('\n')
}
