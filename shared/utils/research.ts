// Research: shared by the API (research agent, notes) and the UI (verdict badges, the project's research profile).

export const VERDICTS = {
  established: { label: 'Established', tone: 'good' },
  speculative: { label: 'Plausible but speculative', tone: 'warn' },
  contradicts: { label: 'Contradicts known science or history', tone: 'bad' },
  unknown: { label: 'Unknown', tone: 'neutral' },
} as const
export type Verdict = keyof typeof VERDICTS

// verified: the quote was found on the fetched page. unverified: the page could not be read or the quote is not on it.
// not_checked: the page is a PDF (no text extraction without a heavy dependency).
export type SourceStatus = 'verified' | 'unverified' | 'not_checked'
export interface ResearchSource { n: number, url: string, title: string, quote: string, status: SourceStatus, reason: string | null }
// basis: source (cited pages), calculator (a tool this run called), model (no source: model knowledge, unverified).
export interface ResearchClaim { text: string, basis: 'source' | 'calculator' | 'model', sources: number[], tool: string | null }
export interface ResearchCalculation { name: string, args: Record<string, unknown>, result: unknown, assumptions: string[], error: string | null }

export const RESEARCH_FIELDS = { '': 'Not set', history: 'History', crime: 'Crime', science_fiction: 'Science fiction', other: 'Other' } as const
export interface ResearchProfile { field: keyof typeof RESEARCH_FIELDS, period: string, place: string, legal_system: string, notes: string }
export const PROFILE_LIMITS = { period: 200, place: 200, legal_system: 200, notes: 2000 } as const

export function researchProfile(raw: string | null | undefined): ResearchProfile {
  let p: Record<string, unknown> = {}
  try {
    p = JSON.parse(raw || '{}') ?? {}
  } catch { /* an unreadable profile reads as empty */ }
  const text = (k: keyof typeof PROFILE_LIMITS) => (typeof p[k] === 'string' ? p[k] as string : '')
  const field = typeof p.field === 'string' && Object.hasOwn(RESEARCH_FIELDS, p.field) ? p.field as ResearchProfile['field'] : ''
  return { field, period: text('period'), place: text('place'), legal_system: text('legal_system'), notes: text('notes') }
}
