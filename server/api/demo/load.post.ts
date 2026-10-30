// Empties the current project and imports a sample set. Replacing a project's data is an admin action; other projects are untouched.
// - broken-tide (default): the synthetic demo, lore first, then scenes in order. In recorded mode its candidates replay a recorded run.
// - lantern-row: a tiny second sample with no recorded run. Its canon is a handful of facts added by hand through the same
//   endpoint (and the same verbatim-quote check) a person uses from the reader, credited to whoever loaded it.
const SETS = ['broken-tide', 'lantern-row'] as const

export default defineEventHandler(async (event) => {
  requireRole('admin')
  const body = (await readBody<{ set?: string }>(event).catch(() => null)) ?? {}
  const set = SETS.find(s => s === (body.set ?? 'broken-tide'))
  if (!set) throw createError({ statusCode: 400, statusMessage: 'BAD_SET', message: `set must be one of ${SETS.join(', ')}.` })
  resetData()
  const assets = useStorage('assets:server')
  const files = (await assets.getKeys(`${set}:docs`)).map(k => k.split(':').pop()!)
    .sort((a, b) => Number(/^S\d/.test(a)) - Number(/^S\d/.test(b)) || a.localeCompare(b))
  const results = []
  for (const filename of files) {
    const content = await assets.getItem<string>(`${set}:docs:${filename}`)
    if (content) results.push(await importDocument(filename, String(content)))
  }
  if (set === 'lantern-row') {
    const facts = (await assets.getItem<Record<string, string>[]>('lantern-row:facts.json')) ?? []
    for (const { file, ...fact } of facts) {
      const document_id = results.find(r => r.filename === file)?.document_id
      await event.$fetch('/api/facts', { method: 'POST', body: { ...fact, document_id, to: 'canon' } })
    }
  }
  return { results }
})
