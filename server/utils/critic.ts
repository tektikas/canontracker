import { createHash } from 'node:crypto'

// The AI critic: a second model opinion on pending candidates (keep / reject / needs edit, with a reason and one line why).
// It runs in batches after extraction and on demand (POST /api/facts/critic). Advice only: it writes critic_opinions rows and
// never touches a fact, its evidence or its status; a person still decides each candidate. Only candidates whose quote is
// verbatim in its passage are sent (re-checked here, like accept does), so the Critic can never "keep" a blocked one.
// Effort bounds the cost: candidates per model call and per run (NUXT_CRITIC_EFFORT = off | low | high). Small batches keep
// each opinion about its own candidate (the model echoes the statement it judged; cleanOpinions drops a mismatch), and a flag
// counts only when two more readings of that candidate alone, with the whole document, flag it too.
// reasoning: the reasoning_effort a batch reading sends (Muse reasons at "high" when none is sent); confirm: the one the few
// second readings of a flag send. NUXT_CRITIC_REASONING_EFFORT overrides both (minimal | low | medium | high; "none" is
// refused by the API with a json_schema, so it is ignored here).
const EFFORT: Record<string, { batch: number, max: number, reasoning: string, confirm: string } | null> = {
  off: null, low: { batch: 5, max: 80, reasoning: 'low', confirm: 'medium' }, high: { batch: 3, max: 500, reasoning: 'medium', confirm: 'high' },
}
const REASONING = ['minimal', 'low', 'medium', 'high']
const CANON_PER_CANDIDATE = 8

export function criticEffort() {
  const { criticEffort } = useRuntimeConfig()
  return EFFORT[criticEffort as string] === undefined ? EFFORT.low : EFFORT[criticEffort as string]
}
export function criticReasoning(effort: { reasoning: string, confirm: string }) {
  const set = String(useRuntimeConfig().criticReasoningEffort ?? '')
  return REASONING.includes(set) ? { batch: set, confirm: set } : { batch: effort.reasoning, confirm: effort.confirm }
}

type Listed = ReturnType<typeof listFacts>[number]
const shown = (f: Listed) => candidateFingerprint({ ...f, identity: identityOf(f) })

type CanonRow = { id: string, statement: string, subject: string, predicate: string, object: string | null, time_label: string | null }
// Accepted canon about a candidate's names (kept identities after merges): the closest few are what the Critic reads for
// duplicates. `hash` covers every canon fact that could repeat it, shown or not: those about exactly the candidate's names
// (the same subject and object, either way round). An opinion read before that canon changed (a fact accepted, superseded or
// merged in) no longer counts as a keep. Canon about other parties can't repeat it, so it doesn't count: accepting "Ves is
// at Saltgate" or "Ves is a scout" leaves the keep on "Ves is at the Bell Gate" standing.
function canonNear() {
  const kept = keptNameOf()
  const rows = useDb().prepare(`select id, statement, subject, predicate, object, time_label from facts where project_id = ? and status = 'canon' order by rowid`).all(pid()) as CanonRow[]
  const byName = new Map<string, CanonRow[]>()
  for (const f of rows) for (const n of new Set([kept(f.subject), kept(f.object)].filter(Boolean))) byName.set(n, [...(byName.get(n) ?? []), f])
  return (f: { subject: string, predicate: string, object: string | null }) => {
    const names = [...new Set([kept(f.subject), kept(f.object)].filter(Boolean))]
    const near = new Map<string, CanonRow>()
    for (const n of names) for (const c of byName.get(n) ?? []) near.set(c.id, c)
    const all = [...near.values()]
    // The closest first: the same names on both sides, then the same predicate.
    const score = (c: CanonRow) => (names.every(n => n === kept(c.subject) || n === kept(c.object)) ? 2 : 0) + (c.predicate === f.predicate ? 1 : 0)
    const key = (n: string[]) => JSON.stringify([...new Set(n)].sort())
    const could = all.filter(c => key([kept(c.subject), kept(c.object)].filter(Boolean)) === key(names))
    const hash = createHash('sha256').update(JSON.stringify(could.map(c => [c.id, c.statement, c.subject, c.predicate, c.object, c.time_label]))).digest('hex')
    return { shown: all.toSorted((a, b) => score(b) - score(a)).slice(0, CANON_PER_CANDIDATE), hash }
  }
}

export async function runCritic(factIds: string[]) {
  const effort = criticEffort()
  if (!effort || !factIds.length) return { asked: 0, opinions: 0, unverified: 0, left: 0 }
  const db = useDb()
  const wanted = new Set(factIds)
  const pending = listFacts(`status = 'pending'`).filter(f => wanted.has(f.id))
  const ready = pending.filter(f => hasVerifiedQuote(f.id))
  const batch = ready.slice(0, effort.max)

  const near = canonNear()
  const canonSeen = new Map<string, string>()
  const passage = db.prepare(`select p.text, p.ordinal, p.document_id, d.sha256 from evidence e join passages p on p.id = e.passage_id
    join documents d on d.id = e.document_id where e.id = ?`)
  // The passages just around the cited one: a scene's place or day is often set a paragraph earlier.
  const around = db.prepare('select ordinal, text from passages where document_id = ? and ordinal between ? and ? and ordinal != ? order by ordinal')
  const split = (p: { ordinal: number }, rows: { ordinal: number, text: string }[]) => ({
    before: rows.filter(n => n.ordinal < p.ordinal).map(n => n.text), after: rows.filter(n => n.ordinal > p.ordinal).map(n => n.text),
  })
  // A flag gets a second reading with the whole document around the passage (up to 40 paragraphs either side).
  const wide = new Map<string, () => CriticItem>()
  const items = batch.map((f): CriticItem => {
    const ev = f.evidence.find(e => e.verified && e.passage_id && isVerbatimQuote((passage.get(e.id) as { text: string }).text, e.quote))!
    const p = passage.get(ev.id) as { text: string, ordinal: number, document_id: string, sha256: string }
    const context = around.all(p.document_id, p.ordinal - 3, p.ordinal + 1, p.ordinal) as { ordinal: number, text: string }[]
    const canon = near(f)
    canonSeen.set(f.id, canon.hash)
    const item = {
      id: f.id, statement: f.statement, kind: f.kind, subject: f.subject, predicate: f.predicate, object: f.object, value: f.value,
      time_label: f.time_label, quote: ev.quote, passage: p.text, sha256: p.sha256, ...split(p, context),
      source: `${ev.document_title}${ev.start_line ? `, line ${ev.start_line}` : ''}`, canon: canon.shown,
    }
    wide.set(f.id, () => ({ ...item, ...split(p, around.all(p.document_id, p.ordinal - 40, p.ordinal + 40, p.ordinal) as { ordinal: number, text: string }[]) }))
    return item
  })

  const modelId = criticModelId()
  const seen = new Map(batch.map(f => [f.id, shown(f)]))
  const reasoning = criticReasoning(effort)
  let opinions = 0
  for (let i = 0; i < items.length; i += effort.batch) {
    // A batch reading sees a few paragraphs and is the noisier one, so a flag (reject or needs edit) must hold up on two more
    // single-candidate readings with the whole document: it stands only if both flag it too (their first opinion is kept);
    // a keep from either wins. Readings that fail or give nothing usable don't count; with none left, the first stands. Every
    // call is in model_calls. The person still reads every candidate either way.
    const drafts: CriticDraft[] = []
    for (const d of await critiqueCandidates(items.slice(i, i + effort.batch), reasoning.batch)) {
      const again = d.verdict === 'keep' ? [] : (await Promise.all([0, 1].map(() => critiqueCandidates([wide.get(d.fact_id)!()], reasoning.confirm).catch(() => [])))).flat()
      drafts.push(again.find(o => o.verdict === 'keep') ?? again[0] ?? d)
    }
    const insert = db.prepare(`insert into critic_opinions (id, fact_id, verdict, reason, duplicate_of, explanation, suggestion, seen, canon_seen,
      model_id, prompt_version, created_at, project_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    tx(() => {
      for (const d of drafts) {
        insert.run(newId('crit'), d.fact_id, d.verdict, d.reason, d.duplicate_of, d.explanation, d.suggestion && JSON.stringify(d.suggestion),
          seen.get(d.fact_id)!, canonSeen.get(d.fact_id)!, modelId, PROMPT_VERSIONS.critic, now(), pid())
      }
    })
    opinions += drafts.length
  }
  return { asked: items.length, opinions, unverified: pending.length - ready.length, left: ready.length - batch.length }
}

// The newest opinion per candidate, for the review list. current = the candidate still reads as it did when the Critic read it
// (same wording, evidence, versions and merge mappings); an older opinion is shown as such and never counts as a "keep".
// canon_changed = canon about its names changed since (see canonNear): the opinion still shows, but a keep no longer counts.
export function withCritic<T extends Listed & { identity: ReturnType<typeof identityOf> }>(facts: T[]) {
  const db = useDb()
  const latest = db.prepare('select * from critic_opinions where project_id = ? and fact_id = ? order by rowid desc limit 1')
  const statement = db.prepare('select statement from facts where id = ? and project_id = ?')
  const near = canonNear()
  return facts.map((f) => {
    const o = latest.get(pid(), f.id) as { id: string, verdict: CriticVerdict, reason: CriticReason, duplicate_of: string | null, explanation: string, suggestion: string | null, seen: string, canon_seen: string, created_at: string } | undefined
    if (!o) return { ...f, critic: null }
    const dup = o.duplicate_of ? (statement.get(o.duplicate_of, pid()) as { statement: string } | undefined)?.statement ?? null : null
    return { ...f, critic: {
      id: o.id, verdict: o.verdict, reason: o.reason, explanation: o.explanation, created_at: o.created_at,
      duplicate_of: o.duplicate_of, duplicate_statement: dup, suggestion: o.suggestion ? JSON.parse(o.suggestion) as CriticSuggestion : null,
      current: o.seen === candidateFingerprint(f), canon_changed: o.canon_seen !== near(f).hash,
    } }
  })
}
