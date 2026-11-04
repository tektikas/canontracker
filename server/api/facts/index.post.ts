// A person adds a fact from text they selected in a source. The quote must appear in that passage (findQuotePassage folds
// typography and returns the passage's own characters, which are stored; the same check extraction, MCP proposals and accept use). to = canon: the person creating and confirming it is the human decision (audited as fact.authored);
// to = review: it waits in the review queue like any candidate. continuity_id (to = review only): a "new" finding of that
// continuity check sent to review; the candidate's origin is continuity:<id>. The check must be one this person can read, of
// this document, and the quote must be the sentence of one of its "new" findings (else 422).
const KINDS = ['character', 'location', 'relationship', 'event', 'rule', 'claim']
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const fail = (statusCode: number, statusMessage: string, message: string) => createError({ statusCode, statusMessage, message })

export default defineEventHandler(async (event) => {
  const b = await readObject<Record<string, unknown>>(event)
  const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
  const to = b.to === 'review' ? 'review' : b.to === 'canon' ? 'canon' : null
  if (!to) throw fail(400, 'BAD_TARGET', 'to must be canon or review.')
  if (to === 'canon') requireHuman(event)
  const db = useDb()
  const run = b.continuity_id == null ? null : getContinuityRun(idOf(b.continuity_id))
  const continuity = run?.id ?? null
  if (continuity && to !== 'review') throw fail(400, 'BAD_TARGET', 'A continuity finding goes to review, not straight to canon.')

  const doc = db.prepare('select * from documents where id = ? and project_id = ?').get(String(b.document_id ?? ''), pid()) as unknown as DocumentRow | undefined
  if (!doc) throw fail(404, 'NOT_FOUND', 'Document not found.')
  const latest = latestDocument(doc.filename)!
  if (latest.id !== doc.id) throw fail(409, 'OLD_VERSION', `This is v${doc.version}; cite the latest version (v${latest.version}) instead.`)
  const quote = typeof b.quote === 'string' ? b.quote.trim() : ''
  if (!quote) throw fail(422, 'QUOTE_REQUIRED', 'Select the words in the source that say this.')
  const passages = db.prepare('select * from passages where document_id = ? order by ordinal').all(doc.id) as unknown as PassageRow[]
  const match = findQuotePassage(passages, quote, run?.passage_id ?? (typeof b.passage_id === 'string' ? b.passage_id : null))
  if (!match) throw fail(422, 'UNVERIFIED_EVIDENCE', `The quote must be words from one paragraph of the source (curly quotes, dashes and line breaks may differ) and at least ${MIN_QUOTE_CHARS} characters, so it can back a fact.`)
  if (run && (run.document_id !== doc.id || !run.findings.some(f => f.kind === 'new' && norm(f.sentence) === norm(match.quote))))
    throw fail(422, 'NOT_A_NEW_FINDING', 'Only a “new” finding of that continuity check can go to review, quoting its sentence from the document it checked.')
  const passage = match.passage

  const kind = str(b.kind) || 'claim'
  if (!KINDS.includes(kind)) throw fail(400, 'BAD_KIND', `kind must be one of ${KINDS.join(', ')}.`)
  const predicate = str(b.predicate).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60)
  // A detail's answer ("wound_location_is" → "shoulder") is its value, not an entity, even when typed in the object box.
  const detail = asDetail({ predicate, object: str(b.object).slice(0, 80) || null, value: str(b.value) || null })
  const names = { subject: str(b.subject).slice(0, 80), object: detail.object ?? null }
  const statement = str(b.statement).slice(0, 500)
  if (!names.subject) throw fail(400, 'SUBJECT_REQUIRED', 'Say who or what the fact is about.')
  if (!predicate) throw fail(400, 'PREDICATE_REQUIRED', 'Say how they relate, for example located_at.')
  if (!statement) throw fail(400, 'STATEMENT_REQUIRED', 'Write the fact as one sentence.')
  // "Arin → is" says nothing on its own: who or what they are is the object.
  if (predicate === 'is' && !names.object) throw fail(400, 'OBJECT_REQUIRED', 'Say what they are in Object, for example “keeper of the lighthouse”.')
  const value = detail.value || null
  // What each name is, picked by the person from the project's entity types (stored like extraction's typing, so a new name's
  // wiki page gets that type). Empty = not said. An object type only goes with an object name.
  const typeKeys = new Set(entityTypes().map(t => t.key))
  const nameType = (role: 'subject' | 'object') => {
    const t = str(b[`${role}_type`])
    if (t && !typeKeys.has(t)) throw fail(400, 'BAD_TYPE', `${role}_type must be one of this project's entity types: ${[...typeKeys].join(', ')}.`)
    return t || null
  }
  const types = { subject: nameType('subject'), object: names.object ? nameType('object') : null }
  if (predicate === 'travel_time' && (!value || !Number.isFinite(Number(value)))) throw fail(400, 'VALUE_REQUIRED', 'Travel time needs the minutes as a number.')

  const range = parseStoryRange(str(b.time_from), str(b.time_to))
  if (range.bad) throw fail(400, 'BAD_TIME', 'Story time must be like D2 14:30, or a whole day like D-3650.')
  const { from: tFrom, to: tTo, day } = range
  if (tFrom != null && tTo != null && tTo < tFrom) throw fail(400, 'BAD_TIME', 'To must be after From.')
  const precision = tFrom == null && tTo == null ? null : b.precision === 'approximate' ? 'approximate' : 'exact'

  // Identity changes only by an explicit choice. A page picked in the form (subject_entity_id / object_entity_id) is stored
  // under the name analysis knows it by, so a renamed page ("Arin" titled "Captain Arin") still meets its other facts in
  // conflicts and impact. Typed text is stored as typed (in the analysis name's casing when it is one): a page title or a
  // hand-typed alias alone never decides who a fact is about.
  const pages = listEntities()
  const linked = (['subject', 'object'] as const).flatMap((role) => {
    const picked = b[`${role}_entity_id`]
    const e = picked ? pages.find(p => p.id === picked) : undefined
    if (picked && !e) throw fail(404, 'NOT_FOUND', `The page linked as ${role} no longer exists.`)
    const page = e ?? (names[role] ? pages.find(p => normName(analysisName(p)) === normName(names[role]!)) : undefined)
    return page && analysisName(page) !== names[role] ? [{ role, from: names[role], to: analysisName(page), entity_id: page.id }] : []
  })
  for (const l of linked) names[l.role] = l.to
  // Canon uses the name a merge already decided on, the same as accepting a candidate does.
  const identity = to === 'canon' ? identityOf(names) : []
  for (const i of identity) names[i.role] = i.to
  const user = access().user.id
  const id = newId('fact')
  tx(() => {
    db.prepare(`insert into facts (id, kind, subject, predicate, object, value, statement, t_from, t_to, time_label, precision, status, confidence,
      origin, model_id, created_at, decided_at, decided_by, decided_token, created_by, project_id, subject_type, object_type) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, null, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, kind, names.subject, predicate, names.object, value, statement, tFrom, tTo, timeLabel(tFrom, tTo, precision, day), precision,
        to === 'canon' ? 'canon' : 'pending', continuity ? `continuity:${continuity}` : 'human', now(), to === 'canon' ? now() : null, to === 'canon' ? user : null, to === 'canon' ? agentToken() : null, user, pid(), types.subject, types.object)
    db.prepare('insert into evidence (id, fact_id, document_id, passage_id, quote, verified, project_id) values (?, ?, ?, ?, ?, 1, ?)')
      .run(newId('ev'), id, doc.id, passage.id, match.quote, pid())
    audit('fact.authored', 'fact', id, {
      to, statement, subject: names.subject, predicate, object: names.object, ...(types.subject && { subject_type: types.subject }), ...(types.object && { object_type: types.object }), document_id: doc.id, passage_id: passage.id, quote: match.quote,
      ...(linked.length && { linked }), ...(continuity && { continuity_id: continuity }),
      ...(identity.length && { identity: identity.map(i => ({ role: i.role, from: i.from, to: i.to, merge_audit_id: i.audit_id })) }),
    })
  })
  return { id, status: to === 'canon' ? 'canon' : 'pending', subject: names.subject, object: names.object }
})
