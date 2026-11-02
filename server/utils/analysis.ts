import { createHash } from 'node:crypto'

const end = (f: Fact) => f.t_to ?? f.t_from!
const overlaps = (a: Fact, b: Fact) => a.t_from! <= end(b) && b.t_from! <= end(a)
const isRule = (f: Fact) => f.kind === 'rule' && f.predicate === 'rule'
export const isTravel = (f: Fact) => f.predicate === 'travel_time' && !!f.value && Number.isFinite(Number(f.value))

export const SEVERITIES = ['hard', 'soft'] as const
export type Severity = typeof SEVERITIES[number]
// hard = breaks canon, soft = worth a look. A project can override a rule's default (projects.severity_defaults, JSON).
export const RULE_SEVERITY: Record<string, Severity> = {
  EXACT_TIME_LOCATION_OVERLAP: 'hard', RELATIONSHIP_AFTER_END: 'hard', TRAVEL_TIME_TOO_SHORT: 'hard',
  APPROX_TIME_LOCATION_OVERLAP: 'soft', WORLD_RULE_VIOLATION: 'soft',
}
export function projectSeverities(raw: string): Record<string, Severity> {
  const set = JSON.parse(raw || '{}') as Record<string, Severity>
  return Object.fromEntries(Object.keys(RULE_SEVERITY).map(r => [r, SEVERITIES.includes(set[r]!) ? set[r]! : RULE_SEVERITY[r]!]))
}

// The deterministic rules for one pair of facts. `travel` is the canon travel_time facts. Also used after a merge to see
// which open conflicts still hold.
export function ruleHits(a: Fact, b: Fact, travel: Fact[]) {
  const hits: { a: Fact, b: Fact, rule: string, rationale: string, confidence: number, near?: boolean }[] = []
  if (normEntity(a.subject) !== normEntity(b.subject)) return hits
  const travelMinutes = (x: string | null, y: string | null) => travel.find(t =>
    (normEntity(t.subject) === normEntity(x) && normEntity(t.object) === normEntity(y))
    || (normEntity(t.subject) === normEntity(y) && normEntity(t.object) === normEntity(x)))

  // A day-only time ("D5") is "some time that day": it can't clash with another place that day, so overlap and travel rules need clock times on both.
  if (a.predicate === 'located_at' && b.predicate === 'located_at' && a.t_from != null && b.t_from != null
    && !isDayOnlyLabel(a.time_label) && !isDayOnlyLabel(b.time_label)
    && normEntity(a.object) !== normEntity(b.object)) {
    const exact = a.precision === 'exact' && b.precision === 'exact'
    if (overlaps(a, b)) {
      hits.push({ a, b, rule: exact ? 'EXACT_TIME_LOCATION_OVERLAP' : 'APPROX_TIME_LOCATION_OVERLAP',
        rationale: exact
          ? `${a.subject} is placed at ${a.object} (${a.time_label}) and ${b.object} (${b.time_label}); both times are exact and overlap.`
          : `${a.subject} may be at ${a.object} (${a.time_label}) and ${b.object} (${b.time_label}) at once, but at least one time is approximate.`,
        confidence: exact ? 0.9 : 0.35 })
    } else {
      const route = travelMinutes(a.object, b.object)
      const [first, second] = a.t_from <= b.t_from ? [a, b] : [b, a]
      const gap = second.t_from! - end(first)
      if (route && gap < Number(route.value))
        hits.push({ a: first, b: second, rule: 'TRAVEL_TIME_TOO_SHORT',
          rationale: `${a.subject} has ${gap} min to get from ${first.object} to ${second.object}, but canon says the trip takes ${route.value} min ("${route.statement}").`,
          confidence: exact ? 0.8 : 0.4,
          near: gap >= Number(route.value) / 2 }) // close to the limit: a soft warning unless the project overrides the rule
    }
  }

  if (a.kind === 'relationship' && b.kind === 'relationship' && a.predicate === b.predicate
    && normEntity(a.object) === normEntity(b.object)) {
    const [ended, later] = a.t_to != null && b.t_from != null && b.t_from > a.t_to ? [a, b]
      : b.t_to != null && a.t_from != null && a.t_from > b.t_to ? [b, a] : []
    if (ended && later)
      hits.push({ a: ended, b: later, rule: 'RELATIONSHIP_AFTER_END',
        rationale: `"${ended.predicate}" between ${ended.subject} and ${ended.object} ended at ${formatStoryTime(ended.t_to!, isDayOnlyLabel(ended.time_label, 'to'))}, but is used as active at ${later.time_label}.`,
        confidence: 0.85 })
  }
  return hits
}

// Narrow conflict checks over accepted canon. Every hit is a candidate for a human, never a verdict.
// Deterministic rules run in code; the world-rule check is model-suggested and labeled as such.
export async function scanConflicts() {
  const db = useDb()
  const facts = db.prepare(`select * from facts where project_id = ? and status = 'canon'`).all(pid()) as unknown as Fact[]
  const ins = db.prepare(`insert or ignore into conflicts (id, left_fact_id, right_fact_id, rule, origin, model_id, rationale, confidence, status, pair_hash, created_at, project_id, severity)
    values (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`)
  const sev = projectSeverities(access().project.severity_defaults)
  const raw = JSON.parse(access().project.severity_defaults || '{}') as Record<string, unknown>
  const explicit = Object.fromEntries(Object.keys(RULE_SEVERITY).map(r => [r, SEVERITIES.includes(raw[r] as Severity)]))
  let created = 0
  const add = (a: Fact, b: Fact, rule: string, rationale: string, confidence: number, modelId: string | null = null, near = false) => {
    const pairHash = createHash('sha256').update([a.id, b.id].sort().join('|') + rule).digest('hex').slice(0, 24)
    const id = newId('conf')
    // An explicit project value (even one equal to the built-in) always wins; only "no override" uses the near-limit rule.
    const severity: Severity = near && !explicit[rule] ? 'soft' : sev[rule]!
    if (ins.run(id, a.id, b.id, rule, modelId ? 'model' : 'rule', modelId, rationale, confidence, pairHash, now(), pid(), severity).changes) {
      audit('conflict.detected', 'conflict', id, { rule, left: a.id, right: b.id, model_id: modelId, severity })
      created++
    }
  }

  const travel = facts.filter(isTravel)
  tx(() => {
    for (const [i, a] of facts.entries()) {
      for (const b of facts.slice(i + 1)) for (const h of ruleHits(a, b, travel)) add(h.a, h.b, h.rule, h.rationale, h.confidence, null, h.near)
    }
  })

  // World rules: give the model the rule and the facts around it (facts sharing its entity, plus other facts about the same actors).
  let modelError: string | null = null
  for (const rule of facts.filter(isRule)) {
    const entity = normEntity(rule.subject)
    const direct = facts.filter(f => f.id !== rule.id && [f.subject, f.object].some(e => normEntity(e) === entity))
    const actors = new Set(direct.map(f => normEntity(f.subject)))
    const context = facts.filter(f => f.id !== rule.id && !isRule(f) && (direct.includes(f) || actors.has(normEntity(f.subject))))
    if (!context.length) continue
    try {
      const violations = await checkRule(rule, context)
      tx(() => {
        for (const v of violations) add(rule, context.find(f => f.id === v.fact_id)!, 'WORLD_RULE_VIOLATION', v.rationale, v.confidence, modelInfo().id)
      })
    } catch (e) {
      modelError = (e as Error).message
    }
  }
  // A scan that finds nothing is still a result: Conflicts says when canon was last checked and how much of it.
  audit('conflict.scan', 'project', pid(), { facts: facts.length, created, model_error: modelError })
  return { created, model_error: modelError }
}

export interface ImpactItem {
  target_type: 'fact' | 'scene', target_id: string, label: string, dependency_type: string
  path: string[], via: string | null, evidence_ids: string[], rationale: string, confidence: number, hop_count: 1 | 2
}

// Bounded impact: accepted canon only, max 2 hops (changed fact -> fact sharing an entity -> scene citing it).
export function analyzeImpact(targetId: string): ImpactItem[] {
  const db = useDb()
  const target = getFact(targetId)
  const canon = db.prepare(`select * from facts where project_id = ? and status = 'canon' and id != ?`).all(pid(), targetId) as unknown as Fact[]
  const scenesCiting = db.prepare(`select distinct d.id, d.title, e.id evidence_id from evidence e
    join documents d on d.id = e.document_id where e.fact_id = ? and d.kind = 'scene' and e.verified = 1`)
  const items: ImpactItem[] = []
  const seenScenes = new Set<string>()
  const addScene = (s: { id: string, title: string, evidence_id: string }, item: Omit<ImpactItem, 'target_type' | 'target_id' | 'label' | 'evidence_ids'>) => {
    if (seenScenes.has(s.id)) return
    seenScenes.add(s.id)
    items.push({ target_type: 'scene', target_id: s.id, label: s.title, evidence_ids: [s.evidence_id], ...item })
  }

  for (const s of scenesCiting.all(targetId) as { id: string, title: string, evidence_id: string }[])
    addScene(s, { dependency_type: 'scene_cites_fact', path: [targetId, s.id], via: null, hop_count: 1, confidence: 0.95,
      rationale: 'This scene is a direct source of the changed fact.' })

  const entities = new Set([normEntity(target.subject), normEntity(target.object)].filter(Boolean))
  for (const f of canon) {
    const shared = [f.subject, f.object].find(e => entities.has(normEntity(e)))
    if (!shared) continue
    const ev = db.prepare('select id from evidence where fact_id = ? and verified = 1').all(f.id) as { id: string }[]
    items.push({ target_type: 'fact', target_id: f.id, label: f.statement, dependency_type: 'shared_entity', path: [targetId, f.id],
      via: shared, evidence_ids: ev.map(e => e.id), hop_count: 1, confidence: 0.85,
      rationale: `Shares "${shared}" with the changed fact; re-check that this still holds.` })
    for (const s of scenesCiting.all(f.id) as { id: string, title: string, evidence_id: string }[])
      addScene(s, { dependency_type: 'scene_cites_dependent_fact', path: [targetId, f.id, s.id], via: shared, hop_count: 2, confidence: 0.75,
        rationale: `Scene is the source of "${f.statement}", which depends on "${shared}".` })
  }
  return items
}
