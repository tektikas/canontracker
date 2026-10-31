// Palette search over the caller's current project: canon facts, entities (any name), documents (title or text) and notes.
// Read only. Candidates, rejected and superseded facts never appear (canon only); notes are editorial and stay their own group.
// ponytail: LIKE scans (all words must match, any order), no ranking beyond prefix/word-start. Fine for thousands of rows;
// move to FTS5 when a project's text outgrows that.
const LIMIT = 6
const SNIP = 90

const esc = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`)
const rank = (text: string, words: string[]) => {
  const t = text.toLowerCase()
  const i = t.indexOf(words[0]!)
  return i === 0 ? 0 : /\W/.test(t[i - 1] ?? ' ') ? 1 : 2
}
// A short window of `text` around the first hit, so the person sees why it matched.
function snippet(text: string, words: string[]) {
  const flat = text.replace(/\s+/g, ' ').trim()
  const at = Math.max(0, Math.min(...words.map(w => flat.toLowerCase().indexOf(w)).filter(i => i >= 0)))
  const from = Math.max(0, at - 30)
  return `${from ? '…' : ''}${flat.slice(from, from + SNIP)}${from + SNIP < flat.length ? '…' : ''}`
}

export default defineEventHandler((event) => {
  const q = String(getQuery(event).q ?? '').trim().slice(0, 80).toLowerCase()
  const words = q.split(/\s+/).filter(Boolean)
  const empty = { q, facts: [], entities: [], documents: [], notes: [] }
  if (!words.length) return empty
  const db = useDb()
  const likes = words.map(w => `%${esc(w)}%`)
  // `col` is one concatenated expression: every word must appear somewhere in it.
  const where = (col: string) => words.map(() => `lower(${col}) like ? escape '\\'`).join(' and ')
  const byRank = <T>(rows: T[], text: (r: T) => string) => rows.map(r => ({ r, k: rank(text(r), words) })).sort((a, b) => a.k - b.k).slice(0, LIMIT).map(x => x.r)

  const facts = db.prepare(`select id, kind, subject, object, statement from facts where project_id = ? and status = 'canon'
    and (${where(`statement || ' ' || subject || ' ' || coalesce(object, '')`)}) order by rowid limit 60`).all(pid(), ...likes) as { id: string, kind: string, subject: string, object: string | null, statement: string }[]

  const entities = listEntities().flatMap((e) => {
    const names = [...namesOf(e), e.summary]
    const hit = names.find(n => words.every(w => n.toLowerCase().includes(w)))
    // Words may also be split across the name and its aliases ("tide keeper"): fall back to the joined text.
    return hit || words.every(w => names.join(' ').toLowerCase().includes(w))
      ? [{ id: e.id, name: e.name, kind: e.kind, via: hit && hit !== e.summary && normName(hit) !== normName(e.name) ? hit : null, summary: e.summary }]
      : []
  })

  // Latest version of each document only: older versions are history, not what the team reads.
  const latest = `d.project_id = ? and d.version = (select max(version) from documents d2 where d2.project_id = d.project_id and d2.filename = d.filename)`
  const passages = db.prepare(`select d.id document_id, d.title, p.id passage_id, p.start_line, p.text from passages p join documents d on d.id = p.document_id
    where ${latest} and (${where('p.text')}) order by d.rowid, p.ordinal limit 200`).all(pid(), ...likes) as { document_id: string, title: string, passage_id: string, start_line: number, text: string }[]
  const titles = db.prepare(`select d.id, d.title from documents d where ${latest} and (${where('d.title')}) order by d.rowid`).all(pid(), ...likes) as { id: string, title: string }[]
  // One row per document: a title match opens the document, a text match opens the exact passage.
  const docs = new Map<string, { id: string, title: string, passage_id: string | null, line: number | null, snippet: string | null }>()
  for (const t of titles) docs.set(t.id, { id: t.id, title: t.title, passage_id: null, line: null, snippet: null })
  for (const p of passages) {
    const d = docs.get(p.document_id)
    if (!d || !d.snippet) docs.set(p.document_id, { id: p.document_id, title: p.title, passage_id: p.passage_id, line: p.start_line, snippet: snippet(p.text, words) })
  }

  const notes = db.prepare(`select n.id, n.document_id, n.passage_id, n.body, n.status, d.title from notes n join documents d on d.id = n.document_id
    where n.project_id = ? and (${where(`n.body || ' ' || n.quote`)}) order by n.rowid desc limit 60`).all(pid(), ...likes) as { id: string, document_id: string, passage_id: string, body: string, status: string, title: string }[]

  return {
    q,
    facts: byRank(facts, f => f.statement),
    entities: byRank(entities, e => e.name),
    documents: byRank([...docs.values()], d => d.title),
    notes: byRank(notes, n => n.body).map(n => ({ id: n.id, document_id: n.document_id, passage_id: n.passage_id, status: n.status, title: n.title, snippet: snippet(n.body, words) })),
  }
})
