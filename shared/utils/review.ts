import { parseStoryRange } from './story-time.ts'

// What the "Accept all verified" sheet showed for one candidate, as one comparable string: the wording and triple, each
// quote with the passage and document version it cites (and how far behind the latest version that is), and the merge
// mappings that rename it on accept. The page sends it with the id; the server rebuilds it from the database and refuses
// the decision if anything differs, so a bulk acceptance only ever covers what the person read.
// withCritic: the "Accept all the AI critic keeps" sheet also showed the Critic's opinion, so that opinion is part of what the
// person confirmed: a newer opinion, the candidate changing under it, or canon about its names changing since the Critic read
// it refuses the decision the same way.
export interface ShownCandidate {
  statement: string, subject: string, predicate: string, object: string | null
  evidence: { id: string, passage_id: string | null, document_id: string, document_title: string, document_version: number, latest_version: number, start_line: number | null, quote: string, verified: number | boolean, support: string }[]
  identity: { role: string, from: string, to: string }[]
  critic?: { id: string, verdict: string, reason: string, current: boolean, canon_changed: boolean } | null
}
export const candidateFingerprint = (f: ShownCandidate, withCritic = false) => JSON.stringify([
  f.statement, f.subject, f.predicate, f.object ?? null,
  f.evidence.map(e => [e.id, e.passage_id, e.document_id, e.document_title, e.document_version, e.latest_version, e.start_line, e.quote, !!e.verified, e.support]),
  f.identity.map(i => [i.role, i.from, i.to]),
  ...(withCritic ? [f.critic ? [f.critic.id, f.critic.verdict, f.critic.reason, f.critic.current, f.critic.canon_changed] : null] : []),
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
// time: the corrected story time as a label ("D3 14:00", "~ D3", "D3 14:00 – D3 16:00"), null = no time.
export interface CriticSuggestion { statement: string, subject: string, predicate: string, object: string | null, time: string | null }
export interface CriticDraft { fact_id: string, verdict: CriticVerdict, reason: CriticReason, duplicate_of: string | null, explanation: string, suggestion: CriticSuggestion | null }
// What the Critic was asked about one candidate: its statement and structured fields, the canon ids it was shown, and the
// source text it read (kind and text: for the object rule in cleanOpinions).
export interface CriticAsked { statement: string, subject: string, predicate: string, object: string | null, time_label: string | null, canon: Set<string>, kind?: string, text?: string }

// A time label as stored or shown ("D3 14:00", "~ D3", "D3 14:00 – D3 16:00", "until D3 10:00") → its From / Until parts and
// whether it is approximate: the form the edit fields and parseStoryRange take.
export function splitTimeLabel(label?: string | null) {
  const s = (label ?? '').trim()
  const approximate = s.startsWith('~')
  const rest = s.replace(/^~\s*/, '')
  if (/^until\s/i.test(rest)) return { from: '', to: rest.replace(/^until\s+/i, ''), approximate }
  const [from = '', to = ''] = rest.split(/\s+(?:–|—|-|to)\s+/)
  return { from, to, approximate }
}
// The story time a label means, comparable across spellings ("D3" = "D3 – D3"); undefined when it doesn't parse.
const timeKey = (label: string | null) => {
  const { from, to, approximate } = splitTimeLabel(label)
  const r = parseStoryRange(from, to)
  if (r.bad) return undefined
  return r.from == null && r.to == null ? 'none' : JSON.stringify([r.from, r.to, approximate])
}
const norm = (v: string | null) => (v ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const same = (a: string | null, b: string | null) => norm(a) === norm(b)
export const WORDING_ONLY = 'Suggested a wording change only; who, what, where and when stay as they are.'
export const OTHER_PARTY = 'Suggested another party of the same fact as its object; the one the candidate names is in the passage too.'
// Facts the conflict rules read by their object (shared/../server/utils/analysis.ts): there, a different object is a different fact.
const conflictRead = (c: CriticAsked) => ['located_at', 'travel_time', 'rule'].includes(c.predicate) || ['relationship', 'rule'].includes(c.kind ?? '')

// Model output → opinions we can show. One per asked candidate; anything that doesn't hold together is dropped and counted:
// an unknown id or label, an opinion whose echoed statement isn't the candidate's (it was written about another candidate in
// the batch), keep without reason "ok" (or "ok" without keep), "duplicate" without a canon id the Critic was actually shown
// for that candidate, "needs edit" without a full suggestion or with a time that doesn't parse. "Needs edit" is for corrections
// conflicts and impact read: a suggestion that leaves subject, predicate, object and time as they are is a wording nit, so it
// becomes a keep (counted as softened). So does one that only swaps the object for another party when the candidate's own
// object is named in the text the Critic read, unless the conflict rules read that fact by its object (place, travel,
// relationship, rule): "refuses Ysolde" and "refuses the bridge" are the same refusal. A suggestion carries no quote: the quote stays the verified one.
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '')
export function cleanOpinions(raw: unknown, asked: Map<string, CriticAsked>) {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  let softened = 0
  const why: string[] = [] // why each dropped one was dropped, for the model_calls trace
  const drop = (reason: string) => { why.push(reason); return [] }
  const kept = list.flatMap((o): CriticDraft[] => {
    const id = text(o?.id, 80), reason = text(o?.reason, 40) as CriticReason
    let verdict = text(o?.verdict, 20) as CriticVerdict
    let explanation = text(o?.explanation, 300)
    const c = asked.get(id)
    if (!c) return drop('not asked')
    if (seen.has(id)) return drop('second opinion')
    if (!Object.hasOwn(CRITIC_VERDICTS, verdict) || !Object.hasOwn(CRITIC_REASONS, reason) || !explanation) return drop('malformed')
    if (!same(text(o?.statement, 600), c.statement)) return drop('about another candidate')
    if ((verdict === 'keep') !== (reason === 'ok')) return drop('verdict and reason disagree')
    const dup = text(o?.duplicate_of, 80)
    if (reason === 'duplicate' && !c.canon.has(dup)) return drop('duplicate of no canon shown')
    let suggestion: CriticSuggestion | null = null
    if (verdict === 'needs_edit') {
      const s = o?.suggestion
      suggestion = { statement: text(s?.statement, 500), subject: text(s?.subject, 120), predicate: text(s?.predicate, 80), object: text(s?.object, 120) || null, time: text(s?.time, 60).replace(/^(?:-|none|null|n\/a)$/i, '') || null }
      if (!suggestion.statement || !suggestion.subject || !suggestion.predicate) return drop('incomplete suggestion')
      const time = timeKey(suggestion.time)
      if (!time) return drop('suggested time unreadable')
      const rest = same(suggestion.subject, c.subject) && same(suggestion.predicate, c.predicate) && time === timeKey(c.time_label)
      const wording = rest && same(suggestion.object, c.object)
      const party = rest && !!c.object && !conflictRead(c) && ` ${norm(c.text ?? '')} `.includes(` ${norm(c.object)} `)
      if (wording || party) {
        softened++
        verdict = 'keep'
        suggestion = null
        explanation = wording ? WORDING_ONLY : OTHER_PARTY
        seen.add(id)
        return [{ fact_id: id, verdict, reason: 'ok', duplicate_of: null, explanation, suggestion }]
      }
    }
    seen.add(id)
    return [{ fact_id: id, verdict, reason, duplicate_of: reason === 'duplicate' ? dup : null, explanation, suggestion }]
  })
  return { kept, dropped: list.length - kept.length, softened, why }
}
