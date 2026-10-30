const STOP = new Set('the a an and or of to in on at is are was were be by for with from what why who where when how does do did not no it its this that than as has have had about into her his their they them she he'.split(' '))
const terms = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(t => t.length > 1 && !STOP.has(t)) ?? []
// Story-time tokens ("day", "13", "00") appear everywhere: they rank results but can't qualify a match on their own.
const isTimeToken = (t: string) => t === 'day' || /^\d+$/.test(t)

// Accepted canon only. No supporting facts -> unknown. Model offline -> sources only, never an invented answer.
export async function askCanon(question: string, opts: { audit: boolean } = { audit: true }) {
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
    .slice(0, 5)
  const model = modelInfo()
  const traceId = newId('trc')

  let modelError: string | null = null
  let result: { status: 'supported' | 'source_only' | 'unknown', answer: string | null, cited: typeof scored[number]['fact'][] }
  if (!scored.length) {
    result = { status: 'unknown', answer: null, cited: [] }
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
