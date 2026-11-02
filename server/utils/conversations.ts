// Ask as team conversations. A conversation belongs to one project; every member reads all of them and may post in any
// (viewers too, as they could always ask). Each message keeps its author and mode. Canon answers come from askCanon
// (server/utils/qa.ts), so they are exactly as grounded as Ask always was; research answers come from runResearch
// (server/utils/research.ts) and are labelled as outside sources, never canon.
export type Mode = 'canon' | 'research'
export type Part =
  | { type: 'text', text: string }
  // status/answer/fact_ids as askCanon returned them. asked_as: the question as it was asked when a follow-up or the page
  // filled in who "she" is. The cited facts are re-read on every view (fact_ids), so a superseded one shows as such.
  | { type: 'canon', status: 'supported' | 'source_only' | 'unknown', answer: string | null, fact_ids: string[], asked_as: string | null, trace_id: string, model: string, model_error: string | null }
  | { type: 'research', text: string, note_ids: string[] }
  // A continuity check of the attached passage or the message's text (server/utils/continuity.ts); the report is re-read on view.
  | { type: 'continuity', run_id: string, summary: string }
  // A question back instead of an answer; the next message in the same mode continues the same turn (about = the question asked).
  | { type: 'followup', question: string, options: string[], about: string }
  | { type: 'error', text: string }
export interface Chip { type: 'document' | 'passage' | 'entity' | 'conflict', id: string, label: string, quote?: string }
interface ConversationRow { id: string, title: string, mode: Mode, created_by: string, created_at: string, updated_by: string, updated_at: string, project_id: string }
interface MessageRow { id: string, conversation_id: string, role: 'user' | 'assistant', author_id: string, mode: Mode, text: string, parts: string, context: string, reply_to: string | null, created_at: string }

const fail = (statusCode: number, statusMessage: string, message: string) => createError({ statusCode, statusMessage, message })
// Asking may call the live model: 30 messages a minute per person, the same as /api/qa (server/utils/throttle.ts). Research
// posts also count against researchThrottle (server/utils/research.ts).
const posts = fixedWindow(30, 60_000)

export function getConversation(id: string) {
  const c = useDb().prepare('select * from conversations where id = ? and project_id = ?').get(id, pid()) as unknown as ConversationRow | undefined
  if (!c) throw fail(404, 'NOT_FOUND', 'Conversation not found.')
  return c
}

const esc = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`)
export function listConversations(q: string) {
  const like = `%${esc(q)}%`
  return useDb().prepare(`select c.id, c.title, c.mode, c.created_at, c.updated_at, cu.name created_by_name, uu.name updated_by_name,
      (select count(*) from messages m where m.conversation_id = c.id and m.role = 'user') questions,
      (select group_concat(name, ', ') from (select distinct u.name from messages m join users u on u.id = m.author_id where m.conversation_id = c.id and m.role = 'user')) people
    from conversations c left join users cu on cu.id = c.created_by left join users uu on uu.id = c.updated_by
    where c.project_id = ? and (? = '' or c.title like ? escape '\\' or exists (select 1 from messages m where m.conversation_id = c.id and m.text like ? escape '\\'))
    order by c.updated_at desc, c.rowid desc limit 200`).all(pid(), q, like, like) as unknown as (Omit<ConversationRow, 'created_by' | 'updated_by' | 'project_id'> & { created_by_name: string, updated_by_name: string, questions: number, people: string | null })[]
}

// The first question, on one line, cut at a word near 60 characters. Editable afterwards.
export function titleFrom(text: string) {
  const s = text.replace(/\s+/g, ' ').trim()
  if (s.length <= 60) return s
  const cut = s.slice(0, 60)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 60).replace(/[\s,.;:!?–—-]+$/, '')}…`
}

// Context chips are re-resolved here: an id that isn't in this project is dropped, and every label comes from the database,
// never from the client. A quote is kept only when it is verbatim in its passage.
const CHIP_TYPES = ['document', 'passage', 'entity', 'conflict'] as const
function cleanContext(v: unknown): Chip[] {
  if (v == null) return []
  if (!Array.isArray(v) || v.length > 8) throw fail(400, 'INVALID', 'context must be a list of at most 8 items.')
  const db = useDb()
  const out: Chip[] = []
  for (const c of v as Record<string, unknown>[]) {
    const type = CHIP_TYPES.find(t => t === c?.type)
    const id = typeof c?.id === 'string' ? c.id : ''
    if (!type || !id || out.some(o => o.type === type && o.id === id)) continue
    if (type === 'document') {
      const d = db.prepare('select title from documents where id = ? and project_id = ?').get(id, pid()) as { title: string } | undefined
      if (d) out.push({ type, id, label: d.title })
    } else if (type === 'entity') {
      const e = db.prepare('select name from entities where id = ? and project_id = ?').get(id, pid()) as { name: string } | undefined
      if (e) out.push({ type, id, label: e.name })
    } else if (type === 'conflict') {
      const k = db.prepare('select rule from conflicts where id = ? and project_id = ?').get(id, pid()) as { rule: string } | undefined
      if (k) out.push({ type, id, label: `Conflict: ${k.rule.toLowerCase().replaceAll('_', ' ')}` })
    } else {
      const p = db.prepare(`select p.id, p.text, p.start_line, p.end_line, d.title from passages p join documents d on d.id = p.document_id
        where p.id = ? and p.project_id = ?`).get(id, pid()) as { id: string, text: string, start_line: number, end_line: number, title: string } | undefined
      if (!p) continue
      const quote = typeof c.quote === 'string' ? findQuotePassage([p], c.quote.slice(0, 2000))?.quote : undefined
      out.push({ type, id, label: `${p.title}, line ${p.start_line}${p.end_line !== p.start_line ? `–${p.end_line}` : ''}`, ...(quote && { quote }) })
    }
  }
  return out
}

/** Validates a post (text, mode, context, action) and counts it against the rate limit. action "continuity" (Canon mode): check
 * the attached passage's quote, or else the message's text, against canon instead of answering it. */
export async function readPost(event: Parameters<typeof readObject>[0]) {
  const b = await readObject<{ text: string, mode: string, context: unknown, action: unknown }>(event)
  const text = optText(b.text, 'Message', 2000)
  if (!text) throw fail(400, 'MESSAGE_REQUIRED', 'Write a message.')
  if (b.mode != null && b.mode !== 'canon' && b.mode !== 'research') throw fail(400, 'INVALID', 'mode must be "canon" or "research".')
  const mode: Mode = b.mode === 'research' ? 'research' : 'canon'
  const context = cleanContext(b.context)
  if (b.action != null && b.action !== 'continuity') throw fail(400, 'INVALID', 'action must be "continuity".')
  const continuity = b.action === 'continuity'
  if (continuity && mode !== 'canon') throw fail(400, 'INVALID', 'A continuity check runs in Canon mode.')
  if (posts(access().user.id)) throw fail(429, 'TOO_MANY_REQUESTS', 'Asking too fast. Wait a moment.')
  if (mode === 'research') researchThrottle()
  if (continuity) continuityThrottle()
  return { text, mode, context, continuity }
}

export function createConversation(post: { text: string, mode: Mode }) {
  const id = newId('cnv')
  const user = access().user.id
  const t = now()
  tx(() => {
    useDb().prepare('insert into conversations (id, title, mode, created_by, created_at, updated_by, updated_at, project_id) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, titleFrom(post.text), post.mode, user, t, user, t, pid())
    audit('conversation.created', 'conversation', id, { title: titleFrom(post.text), mode: post.mode })
  })
  return getConversation(id)
}

const parse = (m: MessageRow) => JSON.parse(m.parts) as Part[]
function insertMessage(conv: ConversationRow, m: Omit<MessageRow, 'id' | 'conversation_id' | 'created_at' | 'parts' | 'context'> & { parts: Part[], context: Chip[] }) {
  const id = newId('msg')
  const t = now()
  tx(() => {
    useDb().prepare(`insert into messages (id, conversation_id, role, author_id, mode, text, parts, context, reply_to, created_at, project_id)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, conv.id, m.role, m.author_id, m.mode, m.text, JSON.stringify(m.parts), JSON.stringify(m.context), m.reply_to, t, pid())
    useDb().prepare('update conversations set updated_at = ?, updated_by = ?, mode = ? where id = ?').run(t, m.author_id, m.mode, conv.id)
  })
  return useDb().prepare('select * from messages where id = ?').get(id) as unknown as MessageRow
}

// Posts a person's message and the assistant's reply to it. The reply never throws away the question: a failure is stored
// as an error message the whole team sees.
export async function postToConversation(conv: ConversationRow, post: { text: string, mode: Mode, context: Chip[], continuity?: boolean }) {
  const db = useDb()
  const user = access().user
  const earlier = (db.prepare('select * from messages where conversation_id = ? order by rowid').all(conv.id) as unknown as MessageRow[])
  // The latest assistant message, if it asked a follow-up in this mode that nobody has answered yet, is continued by this one.
  const last = earlier.findLast(m => m.role === 'assistant')
  const followup = last && last.mode === post.mode && !earlier.some(m => m.reply_to === last.id)
    ? parse(last).find((p): p is Extract<Part, { type: 'followup' }> => p.type === 'followup') : undefined
  const asked = insertMessage(conv, { role: 'user', author_id: user.id, mode: post.mode, text: post.text, parts: [{ type: 'text', text: post.text }], context: post.context, reply_to: followup ? last!.id : null })

  let parts: Part[]
  try {
    parts = post.continuity ? await continuityReply(post) : post.mode === 'canon' ? await canonReply(post, followup, earlier) : await researchReply(conv, post, followup, earlier)
  } catch (e) {
    parts = [{ type: 'error', text: (e as { message?: string }).message || 'Something went wrong; no answer was written.' }]
  }
  const reply = insertMessage(getConversation(conv.id), { role: 'assistant', author_id: user.id, mode: post.mode, text: partsText(parts), parts, context: [], reply_to: asked.id })
  return present([asked, reply])
}

async function canonReply(post: { text: string, context: Chip[] }, followup: Extract<Part, { type: 'followup' }> | undefined, earlier: MessageRow[]): Promise<Part[]> {
  let asked: string | null = null
  let r: Awaited<ReturnType<typeof askCanon>>
  if (followup) {
    asked = askedAbout(followup.about, post.text)
    r = await askCanon(asked)
  } else {
    const a = await askCanonInConversation(post.text, {
      entityIds: post.context.filter(c => c.type === 'entity').map(c => c.id),
      history: earlier.slice(-6).reverse().map(m => m.text),
    })
    if (a.kind === 'followup') return [{ type: 'followup', question: a.question, options: a.options, about: a.about }]
    asked = a.asked_as
    r = a.result
  }
  return [{ type: 'canon', status: r.status, answer: r.answer, fact_ids: r.cited.map(f => f.id), asked_as: asked, trace_id: r.trace_id, model: r.model.label, model_error: r.model_error }]
}

// The attached passage's quote is the text when there is one (a selection in the reader); otherwise the message itself.
async function continuityReply(post: { text: string, context: Chip[] }): Promise<Part[]> {
  const chip = post.context.find(c => c.type === 'passage' && c.quote)
  const p = chip && useDb().prepare('select document_id from passages where id = ?').get(chip.id) as { document_id: string } | undefined
  const run = chip && p
    ? await runContinuity({ text: chip.quote!, source: 'passage', documentId: p.document_id, passageId: chip.id, where: `from ${chip.label}` })
    : await runContinuity({ text: post.text, source: 'text' })
  return [{ type: 'continuity', run_id: run.id, summary: run.summary }]
}

async function researchReply(conv: ConversationRow, post: { text: string, context: Chip[] }, followup: Extract<Part, { type: 'followup' }> | undefined, earlier: MessageRow[]): Promise<Part[]> {
  const names = authorNames(earlier)
  const question = followup ? `${followup.about}\n\n${followup.question}\n${post.text}` : post.text
  const r = await runResearch({
    projectId: pid(), conversationId: conv.id, question, context: post.context, profile: null,
    history: earlier.slice(-20).map(m => ({ role: m.role, mode: m.mode, author: names.get(m.author_id) ?? 'Unknown user', text: m.text })),
  })
  return r.kind === 'followup'
    ? [{ type: 'followup', question: r.followup?.question || r.text, options: r.followup?.options ?? [], about: question }]
    : [{ type: 'research', text: r.text, note_ids: r.noteIds ?? [] }]
}

// The plain text of a reply, for search and for the history the next answer reads.
function partsText(parts: Part[]) {
  return parts.map(p => p.type === 'text' || p.type === 'research' || p.type === 'error' ? p.text
    : p.type === 'continuity' ? `Continuity check: ${p.summary}`
    : p.type === 'followup' ? `${p.question} ${p.options.join(' / ')}`
    : p.answer ?? (p.status === 'unknown' ? 'Unknown: no accepted canon fact answers this.' : listFacts(`f.id in (${p.fact_ids.map(() => '?').join(', ') || "''"})`, ...p.fact_ids).map(f => f.statement).join(' '))).join('\n')
}

// Users are never deleted, so a removed member's messages keep their name.
function authorNames(rows: MessageRow[]) {
  const ids = [...new Set(rows.map(m => m.author_id))]
  const users = ids.length ? useDb().prepare(`select id, name from users where id in (${ids.map(() => '?').join(', ')})`).all(...ids) as { id: string, name: string }[] : []
  return new Map(users.map(u => [u.id, u.name]))
}

// Messages for the UI: each answer right after the question it answers (two people asking at once must not interleave), the
// cited canon facts re-read, and a question still waiting for its answer marked pending.
export function present(rows: MessageRow[]) {
  const names = authorNames(rows)
  const ids = [...new Set(rows.flatMap(m => parse(m).flatMap(p => (p.type === 'canon' ? p.fact_ids : []))))]
  const facts = new Map(ids.length ? listFacts(`f.id in (${ids.map(() => '?').join(', ')})`, ...ids).map(f => [f.id, f]) : [])
  const answered = new Set(rows.filter(m => m.role === 'assistant').map(m => m.reply_to))
  const shape = (m: MessageRow) => ({
    id: m.id, role: m.role, mode: m.mode, text: m.text, created_at: m.created_at, reply_to: m.reply_to,
    author: { id: m.author_id, name: names.get(m.author_id) ?? 'Unknown user' },
    context: JSON.parse(m.context) as Chip[],
    pending: m.role === 'user' && !answered.has(m.id),
    parts: parse(m).map(p => (p.type === 'canon' ? { ...p, cited: p.fact_ids.map(id => facts.get(id)).filter(f => !!f) }
      : p.type === 'continuity' ? { ...p, report: continuityOrNull(p.run_id) } : p)),
  })
  const byQuestion = new Map<string, MessageRow[]>()
  for (const m of rows) if (m.role === 'assistant' && m.reply_to) byQuestion.set(m.reply_to, [...byQuestion.get(m.reply_to) ?? [], m])
  const placed = new Set(rows.filter(m => m.role === 'user').flatMap(m => byQuestion.get(m.id) ?? []).map(m => m.id))
  return rows.filter(m => m.role === 'user' || !placed.has(m.id)).flatMap(m => [m, ...(m.role === 'user' ? byQuestion.get(m.id) ?? [] : [])]).map(shape)
}

const continuityOrNull = (id: string) => {
  try {
    return getContinuityRun(id)
  } catch {
    return null
  }
}

export function conversationWithMessages(conv: ConversationRow) {
  const rows = useDb().prepare('select * from messages where conversation_id = ? order by rowid').all(conv.id) as unknown as MessageRow[]
  const people = authorNames([{ author_id: conv.created_by } as MessageRow, { author_id: conv.updated_by } as MessageRow])
  return {
    conversation: { id: conv.id, title: conv.title, mode: conv.mode, created_at: conv.created_at, updated_at: conv.updated_at,
      created_by_name: people.get(conv.created_by) ?? 'Unknown user', updated_by_name: people.get(conv.updated_by) ?? 'Unknown user' },
    messages: present(rows),
  }
}
