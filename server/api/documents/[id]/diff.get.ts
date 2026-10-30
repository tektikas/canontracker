// What changed between two versions of one document, passage by passage, and which canon facts cite a passage of the
// older version that was changed or removed (re-check those before the next build). Read-only.
export default defineEventHandler((event) => {
  const db = useDb()
  const get = (id: string) => db.prepare('select id, filename, title, version, origin, imported_at, created_by from documents where id = ? and project_id = ?').get(id, pid()) as unknown as DocumentRow | undefined
  const to = get(getRouterParam(event, 'id')!)
  const fromId = getQuery(event).from
  const from = typeof fromId === 'string' ? get(fromId) : undefined
  if (!to || !from || from.filename !== to.filename) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Version not found.' })
  const passagesOf = (id: string) => db.prepare('select id, ordinal, start_line, end_line, text from passages where document_id = ? order by ordinal').all(id) as unknown as PassageRow[]
  const a = passagesOf(from.id)
  const b = passagesOf(to.id)

  // Pair each run of removed passages with the added run right after it: those are edits, the rest are pure removals/additions.
  type Row = { op: 'same' | 'changed' | 'removed' | 'added', from?: PassageRow, to?: PassageRow, words?: ReturnType<typeof diffWords> }
  const rows: Row[] = []
  const ops = diffSeq(a, b, p => p.text)
  for (let k = 0; k < ops.length;) {
    const o = ops[k]!
    if (o.op === 'same') {
      rows.push({ op: 'same', from: a[o.a], to: b[o.b] })
      k++
      continue
    }
    const dels: PassageRow[] = []
    const ins: PassageRow[] = []
    for (; k < ops.length && ops[k]!.op !== 'same'; k++) {
      const x = ops[k]!
      if (x.op === 'del') dels.push(a[x.a]!)
      else if (x.op === 'ins') ins.push(b[x.b]!)
    }
    // Pair each removed passage with the most similar added one (half its text or more the same), in order: an edit.
    // What stays unpaired was removed or added outright.
    const used = new Set<number>()
    let next = 0
    for (const d of dels) {
      let best = -1
      let bestScore = 0.4999
      for (let j = next; j < ins.length; j++) {
        const sc = similarity(d.text, ins[j]!.text)
        if (sc > bestScore) [best, bestScore] = [j, sc]
      }
      if (best < 0) {
        rows.push({ op: 'removed', from: d })
        continue
      }
      for (; next < best; next++) {
        rows.push({ op: 'added', to: ins[next] })
        used.add(next)
      }
      used.add(best)
      next = best + 1
      rows.push({ op: 'changed', from: d, to: ins[best], words: diffWords(d.text, ins[best]!.text) })
    }
    for (let j = 0; j < ins.length; j++) if (!used.has(j)) rows.push({ op: 'added', to: ins[j] })
  }

  // Canon citing the older version: by passage. Facts on unchanged passages still read word for word in the newer one.
  const touched = new Set(rows.filter(r => r.op === 'changed' || r.op === 'removed').map(r => r.from!.id))
  const facts = listFacts(`status = 'canon' and id in (select fact_id from evidence where document_id = ?)`, from.id)
  const byPassage = new Map<string, { id: string, statement: string, quote: string }[]>()
  let unchanged = 0
  for (const f of facts) {
    for (const ev of f.evidence.filter(e => e.document_id === from.id && e.passage_id)) {
      if (!touched.has(ev.passage_id!)) {
        unchanged++
        continue
      }
      byPassage.set(ev.passage_id!, [...(byPassage.get(ev.passage_id!) ?? []), { id: f.id, statement: f.statement, quote: ev.quote }])
    }
  }
  const counts = { changed: 0, removed: 0, added: 0, same: 0 }
  for (const r of rows) counts[r.op]++
  return {
    from: { id: from.id, version: from.version }, to: { id: to.id, version: to.version },
    counts, recheck: [...byPassage.values()].flat().length, unchanged_citations: unchanged,
    rows: rows.map(r => ({ ...r, facts: r.from ? byPassage.get(r.from.id) ?? [] : [] })),
  }
})
