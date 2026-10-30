// Gold-set evaluation (spec §17). Measures the current database state against hand-labeled expectations;
// targets are hackathon acceptance thresholds, not claims about real-world accuracy.

export interface EvalMetric { key: string, label: string, target: string, measured: string, num: number | null, den: number | null, pass: boolean | null, note?: string }

interface Gold {
  dataset: string
  conflicts: { id: string, rule: string, statements: string[] }[]
  false_alarms: { id: string, statements: string[] }[]
  figurative: string[]
  hallucinated: string[]
  unknown_questions: string[]
  impact: { id: string, rule_contains: string, expected_scenes: string[], excluded_scenes: string[] }
  passages: { statement: string, file: string, line: number }[]
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—')
const ratio = (key: string, label: string, target: string, num: number, den: number, ok: (n: number, d: number) => boolean, note?: string): EvalMetric =>
  ({ key, label, target, measured: den ? `${num}/${den} (${pct(num, den)})` : 'not run', num, den, pass: den ? ok(num, den) : null, note })
const samePair = (a: string[], b: string[]) => a.length === b.length && a.every(s => b.includes(s))

export async function runEval() {
  const gold = await useStorage('assets:server').getItem<Gold>('broken-tide:gold.json')
  if (!gold) throw createError({ statusCode: 500, statusMessage: 'NO_GOLD', message: 'Gold set missing.' })
  const db = useDb()
  const all = listFacts()
  const canon = all.filter(f => f.status === 'canon')
  const byStatement = (s: string) => all.find(f => f.statement === s && f.status === 'canon') ?? all.find(f => f.statement === s)
  const statementOf = new Map(all.map(f => [f.id, f.statement]))
  const conflicts = (db.prepare('select * from conflicts').all() as unknown as ConflictRow[])
    .map(c => ({ ...c, pair: [statementOf.get(c.left_fact_id)!, statementOf.get(c.right_fact_id)!] }))
  const results: EvalMetric[] = []

  const found = gold.conflicts.filter(g => conflicts.some(c => c.rule === g.rule && samePair(c.pair, g.statements)))
  results.push(ratio('conflict_recall', 'Conflict recall (C1–C4)', '4/4', found.length, gold.conflicts.length, (n, d) => n === d,
    gold.conflicts.filter(g => !found.includes(g)).map(g => `missing ${g.id}`).join(', ') || undefined))

  const alerts = conflicts.filter(c => c.confidence >= 0.5)
  const trueAlerts = alerts.filter(c => gold.conflicts.some(g => g.rule === c.rule && samePair(c.pair, g.statements)))
  results.push(ratio('alert_precision', 'Alert precision (confidence ≥ 50%)', '≥ 80%', trueAlerts.length, alerts.length, (n, d) => n / d >= 0.8,
    'Conflicts created by an applied change are not in the baseline gold set.'))

  const falseAlarmsRejected = gold.false_alarms.filter(g => conflicts.some(c => samePair(c.pair, g.statements) && c.status === 'false_positive' && c.confidence < 0.5))
  results.push(ratio('false_alarm', 'A1 flagged as approximate and rejected as false alarm', '1/1', falseAlarmsRejected.length, gold.false_alarms.length, (n, d) => n === d))

  const figurative = gold.figurative.filter(s => byStatement(s)?.status === 'rejected')
  results.push(ratio('figurative', 'Figurative relationship rejected', '1/1', figurative.length, gold.figurative.length, (n, d) => n === d))

  const blocked = gold.hallucinated.filter((s) => {
    const f = byStatement(s)
    return f && f.status !== 'canon' && f.evidence.every(e => !e.verified)
  })
  results.push(ratio('hallucination', 'Invented quote blocked from canon', '1/1', blocked.length, gold.hallucinated.length, (n, d) => n === d))

  const cited = canon.filter(f => f.evidence.some(e => e.verified))
  results.push(ratio('citations', 'Canon facts with a verified citation', '100%', cited.length, canon.length, (n, d) => n === d))

  const located = gold.passages.filter((g) => {
    const f = byStatement(g.statement)
    return f?.evidence.some(e => e.document_filename === g.file && e.start_line != null && e.start_line <= g.line && g.line <= e.end_line!)
  })
  results.push(ratio('passages', 'Claims linked to the correct passage', '≥ 95%', located.length, gold.passages.length, (n, d) => n / d >= 0.95))

  let unknown = 0
  let fabricated = 0
  for (const q of gold.unknown_questions) {
    const r = await askCanon(q, { audit: false })
    if (r.status === 'unknown' && !r.cited.length) unknown++
    fabricated += r.cited.filter(f => !statementOf.has(f.id)).length
  }
  results.push(ratio('unknown', 'Unsupported questions answered "unknown"', '2/2', unknown, gold.unknown_questions.length, (n, d) => n === d))
  results.push({ key: 'fabricated', label: 'Invented source IDs in answers', target: '0', measured: String(fabricated), num: fabricated, den: null, pass: fabricated === 0 })

  const rule = all.find(f => f.statement.includes(gold.impact.rule_contains) && f.version === 1)
  if (rule) {
    const timings: number[] = []
    let items: ImpactItem[] = []
    for (let i = 0; i < 5; i++) {
      const t = performance.now()
      items = analyzeImpact(rule.id)
      timings.push(performance.now() - t)
    }
    const fileOf = db.prepare('select filename from documents where id = ?')
    const scenes = items.filter(i => i.target_type === 'scene').map(i => (fileOf.get(i.target_id) as { filename: string }).filename)
    const hit = gold.impact.expected_scenes.filter(s => scenes.includes(s))
    const leaked = gold.impact.excluded_scenes.filter(s => scenes.includes(s))
    results.push(ratio('impact_recall', `${gold.impact.id} impact recall (scenes)`, '4/4', hit.length, gold.impact.expected_scenes.length, (n, d) => n === d))
    results.push(ratio('impact_precision', `${gold.impact.id} impact precision (scenes)`, '≥ 80%, S01/S03 not listed', hit.length, scenes.length,
      (n, d) => n / d >= 0.8 && !leaked.length, leaked.length ? `wrongly listed: ${leaked.join(', ')}` : undefined))
    const p50 = timings.sort((a, b) => a - b)[2]!
    results.push({ key: 'impact_latency', label: 'Impact analysis p50 over 5 runs', target: '≤ 5 s', measured: `${p50.toFixed(1)} ms`, num: p50, den: null, pass: p50 <= 5000 })
  } else {
    results.push({ key: 'impact_recall', label: `${gold.impact.id} impact recall`, target: '4/4', measured: 'not run', num: null, den: null, pass: null, note: 'Rule fact not imported yet.' })
  }

  const calls = db.prepare(`select count(*) n, sum(status = 'failed') failed from model_calls`).get() as { n: number, failed: number | null }
  results.push({ key: 'model_calls', label: 'Model calls recorded (failed)', target: 'info', measured: `${calls.n} (${calls.failed ?? 0} failed)`, num: calls.n, den: null, pass: null })

  const run = { id: newId('eval'), dataset: gold.dataset, model_id: modelInfo().id, results, created_at: now() }
  db.prepare('insert into eval_runs values (?, ?, ?, ?, ?)').run(run.id, run.dataset, run.model_id, JSON.stringify(results), run.created_at)
  audit('eval.completed', 'eval', run.id, { dataset: gold.dataset, passed: results.filter(r => r.pass).length, failed: results.filter(r => r.pass === false).length })
  return run
}
