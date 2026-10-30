// Move a note along open → ready → done (or back), or edit its text.
export default defineEventHandler(async (event) => {
  const note = getNote(getRouterParam(event, 'id')!)
  const b = (await readBody<Record<string, unknown>>(event)) ?? {}
  const next = { status: note.status, body: note.body }
  if (b.status !== undefined) {
    if (!NOTE_STATUSES.includes(b.status as typeof NOTE_STATUSES[number]))
      throw createError({ statusCode: 400, statusMessage: 'BAD_STATUS', message: `status must be one of ${NOTE_STATUSES.join(', ')}.` })
    next.status = b.status as string
  }
  if (b.body !== undefined) {
    next.body = typeof b.body === 'string' ? b.body.trim() : ''
    if (!next.body) throw createError({ statusCode: 400, statusMessage: 'BODY_REQUIRED', message: 'A note can’t be empty.' })
    if (next.body.length > 4000) throw createError({ statusCode: 400, statusMessage: 'TOO_LONG', message: 'Keep a note under 4,000 characters.' })
  }
  if (next.status === note.status && next.body === note.body) return note
  tx(() => {
    useDb().prepare('update notes set status = ?, body = ?, updated_by = ?, updated_at = ? where id = ?').run(next.status, next.body, access().user.id, now(), note.id)
    audit('note.updated', 'note', note.id, {
      ...(next.status !== note.status && { status: { from: note.status, to: next.status } }),
      ...(next.body !== note.body && { body: { from: note.body, to: next.body } }),
    })
  })
  return getNote(note.id)
})
