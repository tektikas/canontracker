export const TASK_STATUSES = ['open', 'in_progress', 'done', 'wont_fix'] as const

export interface TaskItem {
  id: string, change_id: string, document_id: string, passage_id: string | null, status: string, assignee_id: string | null, assignee_name: string | null
  due_date: string | null, comment: string, path: string[], evidence_ids: string[], rationale: string, hop_count: number, created_at: string, updated_at: string
  updated_by_name: string | null, document_title: string, filename: string, document_version: number, start_line: number | null, quote: string | null
  change_statement: string, change_status: string, path_labels: string[]
}

// Tasks with the scene they point at, the passage to open, and the change that caused them.
export function listTasks(where = '1 = 1', ...params: (string | number)[]) {
  const db = useDb()
  const rows = db.prepare(`select t.*, au.name assignee_name, uu.name updated_by_name, d.title document_title, d.filename, d.version document_version,
      p.start_line, c.proposed_statement change_statement, c.status change_status, c.before_statement,
      (select e.quote from evidence e where e.id = json_extract(t.evidence_ids, '$[0]')) quote
    from tasks t join documents d on d.id = t.document_id join changes c on c.id = t.change_id
    left join passages p on p.id = t.passage_id left join users au on au.id = t.assignee_id left join users uu on uu.id = t.updated_by
    where t.project_id = ? and (${where}) order by t.rowid desc`).all(pid(), ...params) as unknown as (Omit<TaskItem, 'path' | 'evidence_ids' | 'path_labels'> & { path: string, evidence_ids: string, before_statement: string })[]
  const label = db.prepare(`select statement from facts where id = ? and project_id = ?`)
  const doc = db.prepare(`select title from documents where id = ? and project_id = ?`)
  const name = (id: string) => ((label.get(id, pid()) ?? doc.get(id, pid())) as { statement?: string, title?: string } | undefined)
  return rows.map(({ before_statement, ...r }) => {
    const path = JSON.parse(r.path) as string[]
    return { ...r, path, evidence_ids: JSON.parse(r.evidence_ids) as string[],
      path_labels: path.map((id, i) => (i === 0 ? before_statement : (n => n?.statement ?? n?.title ?? id)(name(id)))) } as TaskItem
  })
}

export function getTask(id: string) {
  const t = listTasks('t.id = ?', id)[0]
  if (!t) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Task not found.' })
  return t
}

// Called inside the apply transaction: every scene in the impact manifest becomes one open task, copying its path,
// evidence and rationale. Dependent facts are not tasks; they are only read in the manifest.
export function createTasks(changeId: string, impact: string | null) {
  const items = (JSON.parse(impact ?? '[]') as ImpactItem[]).filter(i => i.target_type === 'scene')
  if (!items.length) return
  const db = useDb()
  const passage = db.prepare('select passage_id from evidence where id = ? and project_id = ?')
  const insert = db.prepare(`insert into tasks (id, change_id, document_id, passage_id, status, path, evidence_ids, rationale, hop_count, created_at, updated_at, project_id)
    values (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`)
  for (const i of items) {
    const p = (passage.get(i.evidence_ids[0] ?? '', pid()) as { passage_id: string | null } | undefined)?.passage_id ?? null
    insert.run(newId('task'), changeId, i.target_id, p, JSON.stringify(i.path), JSON.stringify(i.evidence_ids), i.rationale, i.hop_count, now(), now(), pid())
  }
  audit('task.created', 'change', changeId, { count: items.length, scenes: items.map(i => i.label) })
}

// Called inside the revert transaction: unfinished tasks are no longer needed. They stay, with their history.
export function closeTasks(changeId: string) {
  const r = useDb().prepare(`update tasks set status = 'not_needed', updated_by = ?, updated_at = ? where change_id = ? and project_id = ? and status in ('open', 'in_progress')`)
    .run(access().user.id, now(), changeId, pid())
  if (r.changes) audit('task.closed', 'change', changeId, { count: Number(r.changes) })
}
