const STOP = new Set('the a an and or of to in on at is are was were be by for with from what why who where when how does do did not no it its this that than as has have had about into her his their they them she he'.split(' '))
// A light English stemmer, so a question's word forms meet canon's (wounded/wound/wounds, married/marry, lives/lived/live):
// a plural ending off, then -ed/-ing (when a vowel stays), then a final e and a doubled consonant. Question and canon go
// through the same steps, so it only has to be consistent, not correct English. Numbers and short words stay as they are.
export function stem(t: string) {
  if (t.length < 4 || /\d/.test(t)) return t
  const s = t.replace(/ies$/, 'y').replace(/(?<![su])es$/, '').replace(/(?<![su])s$/, '')
    .replace(/ied$/, 'y').replace(/(?<=[aeiouy].*[^e])ed$|(?<=[aeiouy].*)ing$/, '')
  return s.length < 3 ? t : s.replace(/(?<=..)e$/, '').replace(/([^aeiou])\1$/, '$1')
}
const terms = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(t => t.length > 1 && !STOP.has(t)).map(stem) ?? []
// Story-time tokens ("day", "13", "00") appear everywhere: they rank results but can't qualify a match on their own.
const isTimeToken = (t: string) => t === 'day' || /^\d+$/.test(t)

// Accepted canon only. No supporting facts -> unknown. Model offline -> sources only, never an invented answer.
// limit: how many matching facts are kept (the answer reads the top 5; the follow-up check looks wider).
export async function askCanon(question: string, opts: { audit: boolean, retrievalOnly?: boolean, limit?: number } = { audit: true }) {
  const qTerms = [...new Set(terms(question))]
  const qWords = qTerms.filter(t => !isTimeToken(t))
  // ponytail: keyword overlap over canon facts; swap for FTS5 when canon grows past a few thousand facts
  const scored = listFacts(`status = 'canon'`)
    .map((f) => {
      const hay = new Set(terms(`${f.statement} ${f.subject} ${f.object ?? ''} ${f.evidence.map(e => e.quote).join(' ')}`))
      const words = qWords.filter(t => hay.has(t)).length
      return { fact: f, words, score: words + qTerms.filter(t => isTimeToken(t) && hay.has(t)).length * 0.5 }
    })
    .filter(s => s.words > 0 && s.words >= Math.min(2, qWords.length))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 5)
  const model = modelInfo()
  const traceId = newId('trc')

  let modelError: string | null = null
  let result: { status: 'supported' | 'source_only' | 'unknown', answer: string | null, cited: typeof scored[number]['fact'][] }
  if (!scored.length) {
    result = { status: 'unknown', answer: null, cited: [] }
  } else if (opts.retrievalOnly) {
    result = { status: 'source_only', answer: null, cited: scored.map(s => s.fact) }
  } else {
    try {
      const { answer, factIds } = await answerFromCanon(question, traceId, scored.map(s => s.fact))
      const cited = scored.map(s => s.fact).filter(f => factIds.includes(f.id))
      result = answer && cited.length ? { status: 'supported', answer, cited }
        : model.mode === 'mock' ? { status: 'source_only', answer: null, cited: scored.map(s => s.fact) }
        : { status: 'unknown', answer: null, cited: [] }
    } catch (e) {
      modelError = (e as Error).message
      result = { status: 'source_only', answer: null, cited: scored.map(s => s.fact) }
    }
  }
  if (opts.audit)
    audit('qa.asked', 'question', traceId, { question, status: result.status, fact_ids: result.cited.map(f => f.id), model_id: model.id })
  return { question, ...result, model, trace_id: traceId, model_error: modelError }
}

// Ask in a conversation: the same grounded answer (askCanon), plus follow-up questions. A question that names nobody but says
// "she" or "he" is about one person ("they" is left alone: it is usually a group). The page's entity, or else the latest
// message that names people, says who is in sight: one person → the question is asked about them (and says so); several, or
// none in sight but several in the matching canon → a follow-up asks which one instead of guessing. People are the entity
// pages of kind character or npc. No match at all is still "unknown".
const PRONOUN = /(?<![\p{L}\p{N}])(she|he|her|him|his|hers)(?![\p{L}\p{N}])/iu
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mentions = (text: string, names: string[]) => names.some(n => n.trim() && new RegExp(`(?<![\\p{L}\\p{N}])${esc(n.trim())}(?![\\p{L}\\p{N}])`, 'iu').test(text))
function cast() {
  return (useDb().prepare(`select * from entities where project_id = ? and kind in ('character', 'npc') order by rowid`).all(pid()) as unknown as EntityRow[])
    .map(e => ({ id: e.id, name: analysisName(e), names: namesOf(e) }))
}
// "where was she at dusk?" + "Ysolde" → "where was Ysolde at dusk?"; his/hers (and "her" before a word) take the possessive.
export function askedAbout(question: string, who: string) {
  const m = PRONOUN.exec(question)
  if (!m) return `${question} (${who})`
  const next = question.slice(m.index + m[0].length).match(/^\s+([\p{L}\p{N}]+)/u)?.[1]?.toLowerCase()
  const possessive = /^(his|hers)$/i.test(m[0]) || (/^her$/i.test(m[0]) && !!next && !STOP.has(next))
  return question.slice(0, m.index) + (possessive ? `${who}’s` : who) + question.slice(m.index + m[0].length)
}
export type ConversationAsk =
  | { kind: 'answer', asked_as: string | null, result: Awaited<ReturnType<typeof askCanon>> }
  | { kind: 'followup', question: string, options: string[], about: string }
export async function askCanonInConversation(question: string, opts: { entityIds: string[], history: string[] }): Promise<ConversationAsk> {
  const pronoun = PRONOUN.exec(question)?.[0]
  const people = pronoun ? cast() : []
  if (!pronoun || people.some(p => mentions(question, p.names))) return { kind: 'answer', asked_as: null, result: await askCanon(question) }
  let sight = people.filter(p => opts.entityIds.includes(p.id))
  for (const text of opts.history) {
    if (sight.length) break
    sight = people.filter(p => mentions(text, p.names))
  }
  if (!sight.length) {
    const found = (await askCanon(question, { audit: false, retrievalOnly: true, limit: 20 })).cited
    sight = [...new Set(found.flatMap(f => people.filter(p => p.names.some(n => normName(n) === normName(f.subject)))))]
    if (sight.length < 2) return { kind: 'answer', asked_as: null, result: await askCanon(question) }
  }
  if (sight.length === 1) {
    const asked = askedAbout(question, sight[0]!.name)
    return { kind: 'answer', asked_as: asked, result: await askCanon(asked) }
  }
  return { kind: 'followup', question: `Who do you mean by “${pronoun.toLowerCase()}”?`, options: sight.slice(0, 4).map(p => p.name), about: question }
}
