// Canon citations on an older version of their source, checked against the latest version. Derived on every read, never
// stored, so a later version (or one that restores the sentence) re-classifies at once:
//   unchanged: the quote still appears verbatim, exactly once, in the latest version. A person confirms it (re-pin, audited).
//   outdated:  the quote is gone (count 0) or appears more than once (count > 1, so no single passage holds it). A person
//              decides, citation by citation: propose a change, or keep the citation as it is.
//   kept:      outdated, and a person kept it after checking it against the latest version (evidence.checked_version).
// Canon evidence never moves by itself; only POST /api/facts/recheck moves it, on a person's word.
export type RecheckState = 'unchanged' | 'outdated' | 'kept'

export interface StaleCitation {
  evidence_id: string, fact_id: string, quote: string, document_id: string, document_key: string, version: number
  passage_id: string | null, start_line: number | null, checked_version: number | null
  latest_id: string, latest_version: number, state: RecheckState, to: { passage_id: string, start_line: number } | null
  count: number // how many times the quote appears in the latest version: 1 = unchanged, 0 = gone, 2+ = ambiguous
}

/** How many times `quote` appears verbatim across `passages`, and the passage holding it when that is exactly once. */
export function quoteOccurrences<T extends { text: string }>(passages: T[], quote: string): { count: number, passage?: T } {
  let count = 0
  let passage: T | undefined
  for (const p of passages.filter(p => isVerbatimQuote(p.text, quote))) {
    for (let i = p.text.indexOf(quote); i !== -1; i = p.text.indexOf(quote, i + 1)) count++
    passage = p
  }
  return count === 1 ? { count, passage } : { count }
}

/** The one passage holding `quote` exactly once, or undefined when it is gone or appears more than once. */
export const soleQuotePassage = <T extends { text: string }>(passages: T[], quote: string): T | undefined => quoteOccurrences(passages, quote).passage

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
  const passages = new Map<string, { id: string, text: string, start_line: number }[]>()
  const passagesOf = (id: string) => {
    if (!passages.has(id)) passages.set(id, db.prepare('select id, text, start_line from passages where document_id = ? order by ordinal').all(id) as { id: string, text: string, start_line: number }[])
    return passages.get(id)!
  }
  return rows.map((r) => {
    const { count, passage: hit } = quoteOccurrences(passagesOf(r.latest_id), r.quote)
    const state: RecheckState = hit ? 'unchanged' : (r.checked_version ?? 0) >= r.latest_version ? 'kept' : 'outdated'
    return { ...r, state, count, to: hit ? { passage_id: hit.id, start_line: hit.start_line } : null }
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
