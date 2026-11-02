// Move a task along (open, in progress, done, won't fix), assign it, set a due date or leave a comment.
export default defineEventHandler(async (event) => {
  const task = getTask(getRouterParam(event, 'id')!)
  const b = await readObject<Record<string, unknown>>(event)
  const bad = (statusMessage: string, message: string) => createError({ statusCode: 400, statusMessage, message })
  if (task.status === 'not_needed') throw createError({ statusCode: 409, statusMessage: 'INVALID_STATE_TRANSITION', message: 'The change was reverted, so this task is closed.' })
  if (task.change_status === 'reverted' && ['open', 'in_progress'].includes(b.status as string)) throw createError({ statusCode: 409, statusMessage: 'INVALID_STATE_TRANSITION', message: 'The change was reverted, so this task cannot be reopened.' })
  const next = { status: task.status, assignee_id: task.assignee_id, due_date: task.due_date, comment: task.comment }
  if (b.status !== undefined) {
    if (!TASK_STATUSES.includes(b.status as typeof TASK_STATUSES[number])) throw bad('BAD_STATUS', `status must be one of ${TASK_STATUSES.join(', ')}.`)
    next.status = b.status as string
  }
  if (b.assignee_id !== undefined) {
    next.assignee_id = b.assignee_id === null || b.assignee_id === '' ? null : String(b.assignee_id)
    if (next.assignee_id && !roleIn(access().studio.id, next.assignee_id)) throw bad('BAD_ASSIGNEE', 'Assign the task to a member of this studio.')
  }
  if (b.due_date !== undefined) {
    const d = b.due_date === null || b.due_date === '' ? null : String(b.due_date)
    if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) throw bad('BAD_DATE', 'Use a date like 2026-11-04.')
    next.due_date = d
  }
  if (b.comment !== undefined) {
    next.comment = typeof b.comment === 'string' ? b.comment.trim() : ''
    if (next.comment.length > 4000) throw bad('TOO_LONG', 'Keep a comment under 4,000 characters.')
  }
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter(k => next[k] !== task[k])
  if (!changed.length) return task
  tx(() => {
    useDb().prepare('update tasks set status = ?, assignee_id = ?, due_date = ?, comment = ?, updated_by = ?, updated_at = ? where id = ?')
      .run(next.status, next.assignee_id, next.due_date, next.comment, access().user.id, now(), task.id)
    audit('task.updated', 'task', task.id, { document: task.document_title, change_id: task.change_id,
      ...(changed.includes('status') && { status: { from: task.status, to: next.status } }),
      ...(changed.includes('assignee_id') && { assignee: { from: task.assignee_name, to: next.assignee_id && (useDb().prepare('select name from users where id = ?').get(next.assignee_id) as { name: string }).name } }),
      ...(changed.includes('due_date') && { due_date: { from: task.due_date, to: next.due_date } }),
      ...(changed.includes('comment') && { comment: next.comment }) })
  })
  return getTask(task.id)
})
