// What the "Accept all verified" sheet showed for one candidate, as one comparable string: the wording and triple, each
// quote with the passage and document version it cites (and how far behind the latest version that is), and the merge
// mappings that rename it on accept. The page sends it with the id; the server rebuilds it from the database and refuses
// the decision if anything differs, so a bulk acceptance only ever covers what the person read.
export interface ShownCandidate {
  statement: string, subject: string, predicate: string, object: string | null
  evidence: { id: string, passage_id: string | null, document_id: string, document_title: string, document_version: number, latest_version: number, start_line: number | null, quote: string, verified: number | boolean, support: string }[]
  identity: { role: string, from: string, to: string }[]
}
export const candidateFingerprint = (f: ShownCandidate) => JSON.stringify([
  f.statement, f.subject, f.predicate, f.object ?? null,
  f.evidence.map(e => [e.id, e.passage_id, e.document_id, e.document_title, e.document_version, e.latest_version, e.start_line, e.quote, !!e.verified, e.support]),
  f.identity.map(i => [i.role, i.from, i.to]),
])
