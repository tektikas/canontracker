// The AI critic: a second model opinion on pending candidates (keep / reject / needs edit, with a reason and one line why).
// It runs in batches after extraction and on demand (POST /api/facts/critic). Advice only: it writes critic_opinions rows and
// never touches a fact, its evidence or its status; a person still decides each candidate. Only candidates whose quote is
// verbatim in its passage are sent (re-checked here, like accept does), so the Critic can never "keep" a blocked one.
// Effort bounds the cost: candidates per model call and per run (NUXT_CRITIC_EFFORT = off | low | high).
const EFFORT: Record<string, { batch: number, max: number } | null> = { off: null, low: { batch: 10, max: 80 }, high: { batch: 5, max: 500 } }
const CANON_PER_CANDIDATE = 8

export function criticEffort() {
  const { criticEffort } = useRuntimeConfig()
  return EFFORT[criticEffort as string] === undefined ? EFFORT.low : EFFORT[criticEffort as string]
}

type Listed = ReturnType<typeof listFacts>[number]
const shown = (f: Listed) => candidateFingerprint({ ...f, identity: identityOf(f) })

export async function runCritic(factIds: string[]) {
  const effort = criticEffort()
  if (!effort || !factIds.length) return { asked: 0, opinions: 0, unverified: 0, left: 0 }
  const db = useDb()
  const wanted = new Set(factIds)
  const pending = listFacts(`status = 'pending'`).filter(f => wanted.has(f.id))
  const ready = pending.filter(f => hasVerifiedQuote(f.id))
  const batch = ready.slice(0, effort.max)

  // Accepted canon about the same names (kept identities after merges), for duplicates. The closest few per candidate.
  const kept = keptNameOf()
  const canon = listFacts(`status = 'canon'`)
  const byName = new Map<string, Listed[]>()
  for (const f of canon) for (const n of new Set([kept(f.subject), kept(f.object)].filter(Boolean))) byName.set(n, [...(byName.get(n) ?? []), f])
  const passage = db.prepare(`select p.text, p.ordinal, p.document_id, d.sha256 from evidence e join passages p on p.id = e.passage_id
    join documents d on d.id = e.document_id where e.id = ?`)
  // The passages just around the cited one: a scene's place or day is often set a paragraph earlier.
  const around = db.prepare('select ordinal, text from passages where document_id = ? and ordinal between ? and ? and ordinal != ? order by ordinal')
  const items = batch.map((f): CriticItem => {
    const ev = f.evidence.find(e => e.verified && e.passage_id && isVerbatimQuote((passage.get(e.id) as { text: string }).text, e.quote))!
    const p = passage.get(ev.id) as { text: string, ordinal: number, document_id: string, sha256: string }
    const context = around.all(p.document_id, p.ordinal - 2, p.ordinal + 1, p.ordinal) as { ordinal: number, text: string }[]
    const near = new Map<string, Listed>()
    for (const n of [kept(f.subject), kept(f.object)].filter(Boolean)) for (const c of byName.get(n) ?? []) near.set(c.id, c)
    return {
      id: f.id, statement: f.statement, kind: f.kind, subject: f.subject, predicate: f.predicate, object: f.object, value: f.value,
      time_label: f.time_label, quote: ev.quote, passage: p.text, sha256: p.sha256,
      before: context.filter(n => n.ordinal < p.ordinal).map(n => n.text), after: context.filter(n => n.ordinal > p.ordinal).map(n => n.text),
      source: `${ev.document_title}${ev.start_line ? `, line ${ev.start_line}` : ''}`, canon: [...near.values()].slice(0, CANON_PER_CANDIDATE),
    }
  })

  const modelId = criticModelId()
  const seen = new Map(batch.map(f => [f.id, shown(f)]))
  let opinions = 0
  for (let i = 0; i < items.length; i += effort.batch) {
    const drafts = await critiqueCandidates(items.slice(i, i + effort.batch))
    const insert = db.prepare(`insert into critic_opinions (id, fact_id, verdict, reason, duplicate_of, explanation, suggestion, seen, model_id,
      prompt_version, created_at, project_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    tx(() => {
      for (const d of drafts) {
        insert.run(newId('crit'), d.fact_id, d.verdict, d.reason, d.duplicate_of, d.explanation, d.suggestion && JSON.stringify(d.suggestion),
          seen.get(d.fact_id)!, modelId, PROMPT_VERSIONS.critic, now(), pid())
      }
    })
    opinions += drafts.length
  }
  return { asked: items.length, opinions, unverified: pending.length - ready.length, left: ready.length - batch.length }
}

// The newest opinion per candidate, for the review list. current = the candidate still reads as it did when the Critic read it
// (same wording, evidence, versions and merge mappings); an older opinion is shown as such and never counts as a "keep".
export function withCritic<T extends Listed & { identity: ReturnType<typeof identityOf> }>(facts: T[]) {
  const db = useDb()
  const latest = db.prepare('select * from critic_opinions where project_id = ? and fact_id = ? order by rowid desc limit 1')
  const statement = db.prepare('select statement from facts where id = ? and project_id = ?')
  return facts.map((f) => {
    const o = latest.get(pid(), f.id) as { id: string, verdict: CriticVerdict, reason: CriticReason, duplicate_of: string | null, explanation: string, suggestion: string | null, seen: string, created_at: string } | undefined
    if (!o) return { ...f, critic: null }
    const dup = o.duplicate_of ? (statement.get(o.duplicate_of, pid()) as { statement: string } | undefined)?.statement ?? null : null
    return { ...f, critic: {
      id: o.id, verdict: o.verdict, reason: o.reason, explanation: o.explanation, created_at: o.created_at,
      duplicate_of: o.duplicate_of, duplicate_statement: dup, suggestion: o.suggestion ? JSON.parse(o.suggestion) as CriticSuggestion : null,
      current: o.seen === candidateFingerprint(f),
    } }
  })
}
