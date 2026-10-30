export const NOTE_STATUSES = ['open', 'ready', 'done'] as const

export interface NoteItem {
  id: string, document_id: string, passage_id: string, quote: string, body: string, status: string, created_at: string, updated_at: string
  created_by_name: string, updated_by_name: string | null, document_title: string, filename: string, document_version: number
  start_line: number, end_line: number, passage_text: string
}

// Notes with their author and the passage they are pinned to.
export function listNotes(where = '1 = 1', ...params: (string | number)[]) {
  return useDb().prepare(`select n.id, n.document_id, n.passage_id, n.quote, n.body, n.status, n.created_at, n.updated_at,
      cu.name created_by_name, uu.name updated_by_name, d.title document_title, d.filename, d.version document_version,
      p.start_line, p.end_line, p.text passage_text
    from notes n join documents d on d.id = n.document_id join passages p on p.id = n.passage_id
    left join users cu on cu.id = n.created_by left join users uu on uu.id = n.updated_by
    where n.project_id = ? and (${where}) order by n.rowid desc`).all(pid(), ...params) as unknown as NoteItem[]
}

export function getNote(id: string) {
  const n = listNotes('n.id = ?', id)[0]
  if (!n) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Note not found.' })
  return n
}

// Where a note pinned on another version of a document sits in `passages` (read time only; the note itself never moves).
// Its own passage's context decides first: the same paragraph text, then the same neighbouring paragraphs. A quote found
// only once is taken as is. Anything else is not guessed: `ambiguous` (the words are there more than once) or `gone`.
type P = Pick<PassageRow, 'id' | 'text'>
export function reanchorNote(note: Pick<NoteItem, 'passage_id' | 'quote' | 'passage_text'>, passages: P[], original: P[]) {
  const quote = note.quote || note.passage_text
  const hits = passages.flatMap((p, i) => (quote && p.text.includes(quote) ? [i] : []))
  if (hits.length === 1) return { anchor: passages[hits[0]!]!.id, anchor_issue: null }
  if (!hits.length) return { anchor: null, anchor_issue: 'gone' as const }
  const k = original.findIndex(p => p.id === note.passage_id)
  const score = (i: number) => (passages[i]!.text === original[k]?.text ? 2 : 0)
    + (passages[i - 1]?.text === original[k - 1]?.text ? 1 : 0) + (passages[i + 1]?.text === original[k + 1]?.text ? 1 : 0)
  const scored = hits.map(i => ({ i, s: score(i) })).sort((a, b) => b.s - a.s)
  const [best, next] = scored
  if (best!.s > 0 && best!.s > next!.s) return { anchor: passages[best!.i]!.id, anchor_issue: null }
  return { anchor: null, anchor_issue: 'ambiguous' as const }
}
