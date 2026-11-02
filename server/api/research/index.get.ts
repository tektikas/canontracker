// Every research note in the project, newest first. The page searches and filters by verdict.
export default defineEventHandler(() => listResearchNotes().map(n => ({
  id: n.id, question: n.question, answer: n.answer, verdict: n.verdict, created_at: n.created_at, created_by_name: n.created_by_name,
  recorded: n.recorded, pinned: !!n.pin_passage_id, calculations: n.calculations.filter(c => !c.error).length,
  sources: { total: n.sources.length, verified: n.sources.filter(s => s.status === 'verified').length },
})))
