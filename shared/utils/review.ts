// What the "Accept all verified" sheet showed for one candidate, as one comparable string: the wording and triple, each
// quote with the passage and document version it cites (and how far behind the latest version that is), and the merge
// mappings that rename it on accept. The page sends it with the id; the server rebuilds it from the database and refuses
// the decision if anything differs, so a bulk acceptance only ever covers what the person read.
// withCritic: the "Accept all the AI critic keeps" sheet also showed the Critic's opinion, so that opinion is part of what the
// person confirmed: a newer opinion (or the candidate changing under it) refuses the decision the same way.
export interface ShownCandidate {
  statement: string, subject: string, predicate: string, object: string | null
  evidence: { id: string, passage_id: string | null, document_id: string, document_title: string, document_version: number, latest_version: number, start_line: number | null, quote: string, verified: number | boolean, support: string }[]
  identity: { role: string, from: string, to: string }[]
  critic?: { id: string, verdict: string, reason: string, current: boolean } | null
}
export const candidateFingerprint = (f: ShownCandidate, withCritic = false) => JSON.stringify([
  f.statement, f.subject, f.predicate, f.object ?? null,
  f.evidence.map(e => [e.id, e.passage_id, e.document_id, e.document_title, e.document_version, e.latest_version, e.start_line, e.quote, !!e.verified, e.support]),
  f.identity.map(i => [i.role, i.from, i.to]),
  ...(withCritic ? [f.critic ? [f.critic.id, f.critic.verdict, f.critic.reason, f.critic.current] : null] : []),
])

// The AI critic's opinion on a pending candidate (server/utils/critic.ts). Advice only: it never changes a fact.
export const CRITIC_VERDICTS = { keep: 'Keep', reject: 'Reject', needs_edit: 'Needs edit' } as const
export const CRITIC_REASONS = {
  figurative: 'Figurative',
  not_stated: 'Not stated in the passage',
  ambiguous_time_place: 'Ambiguous time or place',
  duplicate: 'Duplicate',
  wrong_subject: 'Wrong subject',
  ok: 'Stated in the passage',
} as const
export type CriticVerdict = keyof typeof CRITIC_VERDICTS
export type CriticReason = keyof typeof CRITIC_REASONS
export interface CriticSuggestion { statement: string, subject: string, predicate: string, object: string | null }
export interface CriticDraft { fact_id: string, verdict: CriticVerdict, reason: CriticReason, duplicate_of: string | null, explanation: string, suggestion: CriticSuggestion | null }

// Model output → opinions we can show. One per asked candidate; anything that doesn't hold together is dropped and counted:
// an unknown id or label, keep without reason "ok" (or "ok" without keep), "duplicate" without a canon id the Critic was
// actually shown for that candidate, "needs edit" without a full suggestion. A suggestion carries no quote: the quote stays the
// verified one. `canonFor`: the canon ids each candidate was shown.
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '')
export function cleanOpinions(raw: unknown, canonFor: Map<string, Set<string>>) {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  const kept = list.flatMap((o): CriticDraft[] => {
    const id = text(o?.id, 80), verdict = text(o?.verdict, 20) as CriticVerdict, reason = text(o?.reason, 40) as CriticReason
    const explanation = text(o?.explanation, 300)
    if (!canonFor.has(id) || seen.has(id) || !Object.hasOwn(CRITIC_VERDICTS, verdict) || !Object.hasOwn(CRITIC_REASONS, reason) || !explanation) return []
    if ((verdict === 'keep') !== (reason === 'ok')) return []
    const dup = text(o?.duplicate_of, 80)
    if (reason === 'duplicate' && !canonFor.get(id)!.has(dup)) return []
    let suggestion: CriticSuggestion | null = null
    if (verdict === 'needs_edit') {
      const s = o?.suggestion
      suggestion = { statement: text(s?.statement, 500), subject: text(s?.subject, 120), predicate: text(s?.predicate, 80), object: text(s?.object, 120) || null }
      if (!suggestion.statement || !suggestion.subject || !suggestion.predicate) return []
    }
    seen.add(id)
    return [{ fact_id: id, verdict, reason, duplicate_of: reason === 'duplicate' ? dup : null, explanation, suggestion }]
  })
  return { kept, dropped: list.length - kept.length }
}
