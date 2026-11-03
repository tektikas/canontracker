// Gold-set evaluation (spec §17). Measures the current database state against hand-labeled expectations;
// targets are hackathon acceptance thresholds, not claims about real-world accuracy.

export interface EvalMetric { key: string, label: string, target: string, measured: string, num: number | null, den: number | null, pass: boolean | null, note?: string }

interface Gold {
  dataset: string
  conflicts: { id: string, rule: string, statements: string[] }[]
  // A set without a planted beat of a kind (no approximate false alarm, no figurative line, no rule change) leaves it out,
  // and that metric is not shown.
  false_alarms?: { id: string, statements: string[] }[]
  figurative?: string[]
  hallucinated?: string[]
  unknown_questions: string[]
  impact?: { id: string, rule_contains: string, expected_scenes: string[], excluded_scenes: string[] }
  passages: { statement: string, file: string, line: number }[]
  // Conflicts a set plants for after a merge or an applied change: not in the baseline recall, but true alerts, not false ones.
  after_merge?: { id: string, rule: string, statements: string[] }[]
  after_change?: { id: string, rule: string, rule_statement: string, statements: string[] }[]
  // Hits a rule is expected to raise that a person should dismiss (e.g. "shoulder" vs "left arm" for one wound). Open, one counts
  // against alert precision; dismissed as a false alarm, it is a judged alert and leaves precision.
  expected_false_alarms?: { id: string, rule: string, statements: string[] }[]
}

// "C1–C4", "C1–C5, M1": consecutive ids with one prefix read as a range.
function idList(ids: string[]) {
  const runs: { p: string, from: number, to: number }[] = []
  for (const id of ids) {
    const [, p = id, n = ''] = id.match(/^(\D*)(\d+)$/) ?? []
    const last = runs.at(-1)
    if (n && last?.p === p && last.to + 1 === Number(n)) last.to++
    else runs.push({ p, from: n ? Number(n) : NaN, to: n ? Number(n) : NaN })
  }
  return runs.map(r => Number.isNaN(r.from) ? r.p : r.from === r.to ? `${r.p}${r.from}` : `${r.p}${r.from}–${r.p}${r.to}`).join(', ')
}
const allOf = (n: number) => `${n}/${n}`
// "S01/S03" from S01.md, S03-the-kettle-and-coal.md; a long list is counted instead.
const sceneList = (files: string[]) => files.length > 3 ? `${files.length} other scenes` : files.map(f => f.match(/^S\d+/)?.[0] ?? f).join('/')

// The gold set of the sample this project last loaded; a project that never loaded one with a gold set is scored as Broken Tide.
async function goldFor() {
  const loaded = useDb().prepare(`select detail from audit_events where project_id = ? and event_type = 'sample.loaded' order by rowid desc limit 1`).get(pid()) as { detail: string } | undefined
  const set = loaded ? (JSON.parse(loaded.detail) as { set?: string }).set : undefined
  const assets = useStorage('assets:server')
  return (set && await assets.getItem<Gold>(`${set}:gold.json`)) || await assets.getItem<Gold>('broken-tide:gold.json')
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—')
const ratio = (key: string, label: string, target: string, num: number, den: number, ok: (n: number, d: number) => boolean, note?: string): EvalMetric =>
  ({ key, label, target, measured: den ? `${num}/${den} (${pct(num, den)})` : 'not run', num, den, pass: den ? ok(num, den) : null, note })
const samePair = (a: string[], b: string[]) => a.length === b.length && a.every(s => b.includes(s))

// An eval scores what is in the database; it runs no inference. Provenance is the model ids stored on that data.
export function dataModelIds() {
  const rows = useDb().prepare(`select model_id from facts where project_id = ? and model_id is not null
    union select model_id from conflicts where project_id = ? and model_id is not null order by 1`).all(pid(), pid()) as { model_id: string }[]
  return rows.map(r => r.model_id).join(' + ')
}

export async function runEval() {
  const gold = await goldFor()
  if (!gold) throw createError({ statusCode: 500, statusMessage: 'NO_GOLD', message: 'Gold set missing.' })
  const db = useDb()
  const all = listFacts()
  const canon = all.filter(f => f.status === 'canon')
  const byStatement = (s: string) => all.find(f => f.statement === s && f.status === 'canon') ?? all.find(f => f.statement === s)
  const statementOf = new Map(all.map(f => [f.id, f.statement]))
  const conflicts = (db.prepare('select * from conflicts where project_id = ?').all(pid()) as unknown as ConflictRow[])
    .map(c => ({ ...c, pair: [statementOf.get(c.left_fact_id)!, statementOf.get(c.right_fact_id)!] }))
  const results: EvalMetric[] = []

  const found = gold.conflicts.filter(g => conflicts.some(c => c.rule === g.rule && samePair(c.pair, g.statements)))
  results.push(ratio('conflict_recall', `Conflict recall (${idList(gold.conflicts.map(g => g.id))})`, allOf(gold.conflicts.length), found.length, gold.conflicts.length, (n, d) => n === d,
    gold.conflicts.filter(g => !found.includes(g)).map(g => `missing ${g.id}`).join(', ') || undefined))

  const expected = gold.expected_false_alarms ?? []
  const dismissed = (c: typeof conflicts[number]) => c.status === 'false_positive' && expected.some(g => g.rule === c.rule && samePair(c.pair, g.statements))
  const alerts = conflicts.filter(c => c.confidence >= 0.5 && !dismissed(c))
  const known = [...gold.conflicts, ...gold.after_merge ?? [], ...(gold.after_change ?? []).flatMap(g => g.statements.map(s => ({ rule: g.rule, statements: [g.rule_statement, s] })))]
  const trueAlerts = alerts.filter(c => known.some(g => g.rule === c.rule && samePair(c.pair, g.statements)))
  results.push(ratio('alert_precision', 'Alert precision (confidence ≥ 50%)', '≥ 80%', trueAlerts.length, alerts.length, (n, d) => n / d >= 0.8,
    [gold.after_merge || gold.after_change ? 'Conflicts the gold set plants for after a merge or a change count as true alerts.' : 'Conflicts created by an applied change are not in the baseline gold set.',
      expected.length ? `An expected false alarm (${idList(expected.map(g => g.id))}) counts against precision until someone dismisses it.` : ''].filter(Boolean).join(' ')))
  if (expected.length) {
    const judged = expected.filter(g => conflicts.some(c => dismissed(c) && samePair(c.pair, g.statements)))
    results.push(ratio('expected_false_alarms', `${idList(expected.map(g => g.id))} raised and dismissed as a false alarm`, allOf(expected.length), judged.length, expected.length, (n, d) => n === d,
      expected.filter(g => !judged.includes(g)).map(g => `${g.id} ${conflicts.some(c => c.rule === g.rule && samePair(c.pair, g.statements)) ? 'not dismissed' : 'not raised'}`).join(', ') || undefined))
  }

  if (gold.false_alarms?.length) {
    const falseAlarmsRejected = gold.false_alarms.filter(g => conflicts.some(c => samePair(c.pair, g.statements) && c.status === 'false_positive' && c.confidence < 0.5))
    results.push(ratio('false_alarm', `${idList(gold.false_alarms.map(g => g.id))} flagged as approximate and rejected as false alarm`, allOf(gold.false_alarms.length), falseAlarmsRejected.length, gold.false_alarms.length, (n, d) => n === d))
  }

  if (gold.figurative?.length) {
    const figurative = gold.figurative.filter(s => byStatement(s)?.status === 'rejected')
    results.push(ratio('figurative', 'Figurative relationship rejected', allOf(gold.figurative.length), figurative.length, gold.figurative.length, (n, d) => n === d))
  }

  if (gold.hallucinated?.length) {
    const blocked = gold.hallucinated.filter((s) => {
      const f = byStatement(s)
      return f && f.status !== 'canon' && f.evidence.every(e => !e.verified)
    })
    results.push(ratio('hallucination', 'Invented quote blocked from canon', allOf(gold.hallucinated.length), blocked.length, gold.hallucinated.length, (n, d) => n === d))
  }

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
    const r = await askCanon(q, { audit: false, retrievalOnly: true })
    if (r.status === 'unknown' && !r.cited.length) unknown++
    fabricated += r.cited.filter(f => !statementOf.has(f.id)).length
  }
  results.push(ratio('unknown', 'Unsupported questions answered "unknown"', allOf(gold.unknown_questions.length), unknown, gold.unknown_questions.length, (n, d) => n === d))
  results.push({ key: 'fabricated', label: 'Invented source IDs in answers', target: '0', measured: String(fabricated), num: fabricated, den: null, pass: fabricated === 0 })

  const rule = gold.impact && all.find(f => f.statement.includes(gold.impact!.rule_contains) && f.version === 1)
  if (gold.impact && rule) {
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
    results.push(ratio('impact_recall', `${gold.impact.id} impact recall (scenes)`, allOf(gold.impact.expected_scenes.length), hit.length, gold.impact.expected_scenes.length, (n, d) => n === d))
    results.push(ratio('impact_precision', `${gold.impact.id} impact precision (scenes)`, `≥ 80%, ${sceneList(gold.impact.excluded_scenes)} not listed`, hit.length, scenes.length,
      (n, d) => n / d >= 0.8 && !leaked.length, leaked.length ? `wrongly listed: ${leaked.join(', ')}` : undefined))
    const p50 = timings.sort((a, b) => a - b)[2]!
    results.push({ key: 'impact_latency', label: 'Impact analysis p50 over 5 runs', target: '≤ 5 s', measured: `${p50.toFixed(1)} ms`, num: p50, den: null, pass: p50 <= 5000 })
  } else if (gold.impact) {
    results.push({ key: 'impact_recall', label: `${gold.impact.id} impact recall`, target: allOf(gold.impact.expected_scenes.length), measured: 'not run', num: null, den: null, pass: null, note: 'Rule fact not imported yet.' })
  }

  const calls = db.prepare(`select count(*) n, sum(status = 'failed') failed from model_calls where project_id = ?`).get(pid()) as { n: number, failed: number | null }
  results.push({ key: 'model_calls', label: 'Model calls recorded (failed)', target: 'info', measured: `${calls.n} (${calls.failed ?? 0} failed)`, num: calls.n, den: null, pass: null })

  const run = { id: newId('eval'), dataset: gold.dataset, model_id: dataModelIds(), results, created_at: now() }
  db.prepare('insert into eval_runs values (?, ?, ?, ?, ?, ?)').run(run.id, run.dataset, run.model_id, JSON.stringify(results), run.created_at, pid())
  audit('eval.completed', 'eval', run.id, { dataset: gold.dataset, passed: results.filter(r => r.pass).length, failed: results.filter(r => r.pass === false).length })
  return run
}
