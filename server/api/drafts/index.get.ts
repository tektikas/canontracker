// The caller's own unsaved drafts in this project, newest first.
export default defineEventHandler(() =>
  useDb().prepare(`select id, filename, title, kind, length(content) chars, updated_at,
    (select d.id from documents d where d.project_id = r.project_id and d.filename = r.filename order by d.version desc limit 1) document_id
    from drafts r where project_id = ? and user_id = ? order by updated_at desc`).all(pid(), access().user.id) as
    { id: string, filename: string | null, title: string, kind: string, chars: number, updated_at: string, document_id: string | null }[])
