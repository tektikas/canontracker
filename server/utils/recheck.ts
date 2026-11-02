// Canon citations on an older version of their source, checked against the latest version. Derived on every read, never
// stored, so a later version (or one that restores the sentence) re-classifies at once:
//   unchanged: the quote still appears exactly once in the latest version (matched like findQuotePassage, so a change of
//              typography alone, curly to straight quotes or a line break, is unchanged). A person confirms it (re-pin, audited).
//   outdated:  the quote is gone (count 0) or appears more than once (count > 1, so no single passage holds it). A person
//              decides, citation by citation: propose a change, or keep the citation as it is.
//   kept:      outdated, and a person kept it after checking it against the latest version (evidence.checked_version).
// Canon evidence never moves by itself; only POST /api/facts/recheck moves it, on a person's word.
export type RecheckState = 'unchanged' | 'outdated' | 'kept'

export interface StaleCitation {
  evidence_id: string, fact_id: string, quote: string, document_id: string, document_key: string, version: number
  passage_id: string | null, start_line: number | null, checked_version: number | null
  latest_id: string, latest_version: number, state: RecheckState, to: { passage_id: string, start_line: number, quote: string } | null
  count: number // how many times the quote appears in the latest version: 1 = unchanged, 0 = gone, 2+ = ambiguous
}

/** How many times `quote` appears across `passages`, matched like findQuotePassage (quoteMatches: typography folded, each hit
 * still verbatim in its passage), and, when that is exactly once, the passage and the quote as that passage writes it.
 * `fold`: the caller's folds of the passages (each folded once, however many quotes are looked up). */
export function quoteOccurrences<T extends { text: string }>(passages: T[], quote: string, fold?: (p: T) => ReturnType<typeof foldQuoteText>): { count: number, passage?: T, quote?: string } {
  const q = foldQuoteText(quote).str
  const hits = passages.flatMap((p) => {
    const t = fold?.(p)
    if (t && !t.str.includes(q)) return []
    return quoteMatches(p.text, quote, t).filter(m => isVerbatimQuote(p.text, m)).map(m => ({ p, q: m }))
  })
  return hits.length === 1 ? { count: 1, passage: hits[0]!.p, quote: hits[0]!.q } : { count: hits.length }
}

// A document version is immutable (new text = new id), so where a quote sits in it never changes: remembered per
// (latest document id, quote) across requests. Bounded: the oldest entry goes first.
type Occurrence = { count: number, to: StaleCitation['to'] }
const OCCURRENCES_MAX = 20_000
const occurrences = new Map<string, Occurrence>()

/** Every verified citation of a canon fact in this project that points at an older version than its source's latest.
 * `factIds`: only these facts (a page listing a few facts classifies only theirs, not the whole project). */
export function staleCanonCitations(factIds?: string[]): StaleCitation[] {
  const db = useDb()
  const rows = db.prepare(`select e.id evidence_id, e.fact_id, e.quote, e.document_id, d.filename document_key, d.version, e.passage_id,
      p.start_line, e.checked_version, l.id latest_id, l.version latest_version
    from evidence e join facts f on f.id = e.fact_id join documents d on d.id = e.document_id left join passages p on p.id = e.passage_id
    join documents l on l.project_id = d.project_id and l.filename = d.filename
      and l.version = (select max(x.version) from documents x where x.project_id = d.project_id and x.filename = d.filename)
    where f.project_id = ?1 and f.status = 'canon' and e.verified = 1 and d.version < l.version
      and (?2 is null or f.id in (select value from json_each(?2)))
    order by f.rowid, e.rowid`).all(pid(), factIds ? JSON.stringify(factIds) : null) as unknown as Omit<StaleCitation, 'state' | 'to' | 'count'>[]
  type Passage = { id: string, text: string, start_line: number }
  const passages = new Map<string, Passage[]>()
  const passagesOf = (id: string) => {
    if (!passages.has(id)) passages.set(id, db.prepare('select id, text, start_line from passages where document_id = ? order by ordinal').all(id) as Passage[])
    return passages.get(id)!
  }
  // Each passage is folded at most once per call, by passage id; only quotes not remembered yet need it.
  const folds = new Map<string, ReturnType<typeof foldQuoteText>>()
  const fold = (p: Passage) => folds.get(p.id) ?? folds.set(p.id, foldQuoteText(p.text)).get(p.id)!
  const occurrence = (documentId: string, q: string): Occurrence => {
    const key = `${documentId}\0${q}`
    let o = occurrences.get(key)
    if (!o) {
      const { count, passage: hit, quote } = quoteOccurrences(passagesOf(documentId), q, fold)
      o = { count, to: hit ? { passage_id: hit.id, start_line: hit.start_line, quote: quote! } : null }
      if (occurrences.size >= OCCURRENCES_MAX) occurrences.delete(occurrences.keys().next().value!)
      occurrences.set(key, o)
    }
    return o
  }
  return rows.map((r) => {
    const { count, to } = occurrence(r.latest_id, r.quote)
    const state: RecheckState = to ? 'unchanged' : (r.checked_version ?? 0) >= r.latest_version ? 'kept' : 'outdated'
    return { ...r, state, count, to }
  })
}

/** Per fact: outdated if any of its citations is, else unchanged if any is; kept and current citations need nothing. */
export function recheckByFact(citations: StaleCitation[]) {
  const out = new Map<string, 'outdated' | 'unchanged'>()
  for (const c of citations) {
    if (c.state === 'outdated') out.set(c.fact_id, 'outdated')
    else if (c.state === 'unchanged' && !out.has(c.fact_id)) out.set(c.fact_id, 'unchanged')
  }
  return out
}
