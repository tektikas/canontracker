// Empties the current project and imports a sample set. Replacing a project's data is an admin action; other projects are untouched.
// - broken-tide (default): the synthetic demo, lore first, then scenes in order. In recorded mode its candidates replay a recorded run.
// - lantern-row: a tiny second sample with no recorded run. Its canon is a handful of preloaded facts (origin 'sample'): nobody
//   authored or decided them, so they carry no author or decider and the audit says they were loaded, not added by hand.
//   Each quote is still checked verbatim against its passage (findQuotePassage) before its evidence row is written.
// The audit is append-only: a reset keeps earlier events and appends project.reset, then sample.loaded.
const SETS = ['broken-tide', 'lantern-row'] as const
const NAMES = { 'broken-tide': 'the Broken Tide demo', 'lantern-row': 'the Lantern Row sample' }
// ponytail: in-process lock, good for the single Nitro instance this app runs as; move it into the database if it ever scales out.
const loading = new Set<string>()

export default defineEventHandler(async (event) => {
  requireRole('admin')
  // An empty body means the default set. Anything else must be a JSON object: a malformed body never falls through to a reset.
  const raw = (await readRawBody(event))?.trim()
  let body: unknown = {}
  if (raw) {
    try {
      body = JSON.parse(raw)
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'BAD_JSON', message: 'The request body is not valid JSON.' })
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw createError({ statusCode: 400, statusMessage: 'BAD_BODY', message: 'Send a JSON object, for example {"set": "lantern-row"}.' })
  const asked = (body as { set?: unknown }).set ?? 'broken-tide'
  const set = SETS.find(s => s === asked)
  if (!set) throw createError({ statusCode: 400, statusMessage: 'BAD_SET', message: `set must be one of ${SETS.join(', ')}.` })

  const project = pid()
  // expect_project: the page that sends it names the project it showed; a switch from another tab in between refuses the reset.
  const expected = (body as { expect_project?: unknown }).expect_project
  if (expected !== undefined && expected !== project)
    throw createError({ statusCode: 409, statusMessage: 'PROJECT_CHANGED', message: 'Another tab switched projects; nothing was changed. Try again.' })
  if (loading.has(project)) throw createError({ statusCode: 409, statusMessage: 'LOAD_IN_PROGRESS', message: 'A sample is already loading into this project. Wait for it to finish.' })
  loading.add(project)
  try {
    resetData()
    audit('project.reset', 'project', project, { set })
    const assets = useStorage('assets:server')
    const files = (await assets.getKeys(`${set}:docs`)).map(k => k.split(':').pop()!)
      .sort((a, b) => Number(/^S\d/.test(a)) - Number(/^S\d/.test(b)) || a.localeCompare(b))
    const results = []
    for (const filename of files) {
      const content = await assets.getItem<string>(`${set}:docs:${filename}`)
      if (content) results.push(await importDocument(filename, String(content)))
    }
    const facts = set === 'lantern-row' ? preload((await assets.getItem<Record<string, string>[]>('lantern-row:facts.json')) ?? [], results) : []
    const candidates = results.reduce((n, r) => n + (('candidates' in r && r.candidates) || 0), 0)
    audit('sample.loaded', 'project', project, { set, name: NAMES[set], documents: results.length, candidates, facts })
    return { results, facts: facts.length }
  } finally {
    loading.delete(project)
  }
})

// Writes the sample's canon in one transaction. A quote missing from its passage is a broken fixture: fail, write nothing.
function preload(facts: Record<string, string>[], docs: { filename: string, document_id: string }[]) {
  const db = useDb()
  const ids: string[] = []
  tx(() => {
    for (const { file, ...f } of facts) {
      const docId = docs.find(d => d.filename === file)?.document_id
      const passages = db.prepare('select * from passages where document_id = ? order by ordinal').all(docId ?? '') as unknown as PassageRow[]
      const match = findQuotePassage(passages, f.quote)
      if (!docId || !match) throw createError({ statusCode: 500, statusMessage: 'BAD_SAMPLE', message: `Sample fact “${f.statement}” has no verbatim quote in ${file}.` })
      const { from: tFrom, to: tTo, day } = parseStoryRange(f.time_from, f.time_to)
      const precision = tFrom == null && tTo == null ? null : 'exact'
      const id = newId('fact')
      db.prepare(`insert into facts (id, kind, subject, predicate, object, value, statement, t_from, t_to, time_label, precision, status, confidence,
        origin, model_id, created_at, decided_at, decided_by, created_by, project_id) values (?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, 'canon', null, 'sample', null, ?, ?, null, null, ?)`)
        .run(id, f.kind!, f.subject!, f.predicate!, f.object ?? null, f.statement!, tFrom, tTo, timeLabel(tFrom, tTo, precision, day), precision, now(), now(), pid())
      db.prepare('insert into evidence (id, fact_id, document_id, passage_id, quote, verified, project_id) values (?, ?, ?, ?, ?, 1, ?)')
        .run(newId('ev'), id, docId, match.passage.id, match.quote, pid())
      ids.push(id)
    }
  })
  return ids
}
