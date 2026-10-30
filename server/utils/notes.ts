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
