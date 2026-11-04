// The guest demo ("Try the demo", POST /api/auth/guest): its sample projects open with most of the canon in place, so every
// screen has data at once, while Review keeps a short queue for the visitor to decide themselves. Only the guest flow calls
// this, after loadSample(); a normal demo load keeps its full pending queue.
//
// What becomes canon is preloaded sample canon, exactly like Lantern Row's facts.json: origin 'sample', no author, no decider,
// badge "Sample canon (preloaded)". Nobody decided it, and nothing says anybody did. It is every pending candidate whose quote
// is verbatim in its passage and whose recorded AI critic opinion is keep (a set with no critic recording, Sherlock Holmes,
// takes every verified candidate: its gold plan accepts them all). What stays pending: the gold set's review beats (figurative,
// hallucinated), everything the critic did not keep, blocked quotes, and up to HOLD_BACK ordinary keeps spread through the story.
const HOLD_BACK = 10
// A small sample (Broken Tide has 25 candidates) holds back fewer, so canon stays at least this share of its candidates.
const MIN_CANON = 0.6

interface Gold { figurative?: string[], hallucinated?: string[], impact?: { rule_contains: string, expected_scenes: string[] }, [beat: string]: unknown }
// Every string in the gold set's conflict and impact beats (statements, quotes): a candidate they name is never held back.
function strings(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === 'string') out.add(v)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out)
  return out
}

export async function preloadGuestCanon(set: string) {
  const assets = useStorage('assets:server')
  const gold = await assets.getItem<Gold>(`${set}:gold.json`)
  const hasCritic = await assets.hasItem(`${set}:critic.json`)
  const named = [...strings(['conflicts', 'false_alarms', 'expected_false_alarms', 'after_merge', 'after_change'].map(k => gold?.[k]))]
  const beats = new Set([...(gold?.figurative ?? []), ...(gold?.hallucinated ?? [])])
  const db = useDb()
  const verdict = db.prepare('select verdict from critic_opinions where project_id = ? and fact_id = ? order by rowid desc limit 1')
  const pending = listFacts(`status = 'pending'`)
  const eligible = pending.filter(f => !beats.has(f.statement) && hasVerifiedQuote(f.id)
    && (!hasCritic || (verdict.get(pid(), f.id) as { verdict: string } | undefined)?.verdict === 'keep'))
  // Held back: ordinary keeps that no conflict or impact beat needs (a fact the beats name or quote, travel times the travel
  // rule reads, the changed rule and every fact about its subject, which is how its impact reaches the scenes), picked evenly
  // through the story so the queue reads like one.
  const rule = gold?.impact && pending.find(f => f.statement.includes(gold.impact!.rule_contains))
  const needed = (f: (typeof pending)[number]) => named.includes(f.statement) || isTravel(f)
    || (!!rule && [f.subject, f.object].some(n => normEntity(n) === normEntity(rule.subject)))
    || f.evidence.some(e => named.some(s => s.includes(e.quote)))
  const free = eligible.filter(f => !needed(f))
  const n = Math.max(0, Math.min(HOLD_BACK, free.length, eligible.length - Math.ceil(pending.length * MIN_CANON)))
  const held = new Set(Array.from({ length: n }, (_, i) => free[Math.floor(i * free.length / n)]!.id))
  const preload = eligible.filter(f => !held.has(f.id))
  tx(() => {
    const canon = db.prepare(`update facts set status = 'canon', origin = 'sample', decided_at = ?, decided_by = null, decided_token = null, rationale = null
      where id = ? and project_id = ? and status = 'pending'`)
    for (const f of preload) canon.run(now(), f.id, pid())
    audit('sample.preloaded', 'project', pid(), { set, facts: preload.length, held_back: held.size })
  })
  // The critic read the held-back candidates before any canon existed; it reads them again against today's canon (replayed from
  // the sample's recording, like the load), so its keep is current rather than "canon changed since".
  const left = listFacts(`status = 'pending'`).filter(f => hasVerifiedQuote(f.id)).map(f => f.id)
  if (hasCritic && left.length) await runCritic(left)
  return { preloaded: preload.length, held_back: held.size }
}

// The payoff, visible without clicks: the conflict scan (rule checks replay the sample's recording), and for sets with a rule
// change in their gold set, that change proposed with its impact analysed. Proposed, never accepted: deciding it is the visitor's.
const PROPOSALS: Record<string, { to: (g: any) => string, why: string }> = {
  'broken-tide': { to: () => 'The chord stone erases the last day from the memory of whoever carries it.', why: 'The story needs a longer blackout: an hour is too short for what Arin forgets.' },
  'ashbell-pass': { to: g => g.after_change[0].rule_statement, why: 'Design wants the bell usable mid-quest; a day without a voice breaks the dialogue system.' },
}
export async function guestPayoff(set: string) {
  const scan = await scanConflicts()
  const p = PROPOSALS[set]
  const gold = await useStorage('assets:server').getItem<any>(`${set}:gold.json`)
  if (!p || !gold?.impact) return { scan, change: null }
  const db = useDb()
  const target = db.prepare(`select * from facts where project_id = ? and status = 'canon' and instr(statement, ?) > 0 order by rowid limit 1`).get(pid(), gold.impact.rule_contains) as unknown as Fact | undefined
  if (!target) return { scan, change: null }
  // The same writes as POST /api/changes (a draft proposal, then its bounded impact), marked as part of the sample.
  const id = newId('chg')
  const proposed = p.to(gold)
  db.prepare(`insert into changes (id, target_fact_id, before_statement, proposed_statement, rationale, status, created_at, project_id) values (?, ?, ?, ?, ?, 'analyzing', ?, ?)`)
    .run(id, target.id, target.statement, proposed, p.why, now(), pid())
  audit('change.created', 'change', id, { target_fact_id: target.id, before: target.statement, proposed, sample: true })
  const impact = analyzeImpact(target.id)
  db.prepare(`update changes set status = 'ready_for_review', impact = ? where id = ?`).run(JSON.stringify(impact), id)
  audit('impact.completed', 'change', id, { items: impact.length, scenes: impact.filter(i => i.target_type === 'scene').map(i => i.label), max_hops: 2 })
  return { scan, change: id }
}
