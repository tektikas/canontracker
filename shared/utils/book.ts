// The book model: a story bible or a manuscript as chapters. One shape feeds the print view (BookView.vue) and the EPUB,
// so both read the same. Pure data, no markup. Notes are the citations: numbered per chapter, shown at the chapter's end.

export interface BookPara { text: string, kind?: 'h' | 'ed' | 'small' }
export interface BookFact { n: string, statement: string, label: string | null, approx: boolean, sample: boolean, notes: number[] }
export interface BookSection {
  id: string, title: string, sub: string, portrait: string | null, portraitKey: string | null, paras: BookPara[], facts: BookFact[]
}
export interface BookChapter { id: string, title: string, intro: string, sections: BookSection[], notes: { n: number, text: string }[] }
export interface Book { kicker: string, title: string, studio: string, line: string, cover: string | null, chapters: BookChapter[], flow?: boolean }

const section = (id: string, title = '', extra: Partial<BookSection> = {}): BookSection =>
  ({ id, title, sub: '', portrait: null, portraitKey: null, paras: [], facts: [], ...extra })
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function bibleBook(b: Bible): Book {
  const on = new Set(b.sections)
  const fact = new Map(b.facts.map(f => [f.n, f]))
  const chapters: BookChapter[] = []
  // A chapter's facts carry their citations as notes numbered from 1 within it.
  const chapter = (id: string, title: string, intro = '') => {
    const c: BookChapter = { id, title, intro, sections: [], notes: [] }
    chapters.push(c)
    return c
  }
  const bookFact = (c: BookChapter, n: string, withNotes = true): BookFact => {
    const f = fact.get(n)!
    const notes = withNotes ? f.citations.map((ct) => {
      const k = c.notes.length + 1
      c.notes.push({ n: k, text: `${f.n}: “${ct.quote}” ${citeLine(ct)}` })
      return k
    }) : []
    return { n: f.n, statement: f.statement, label: f.time_label ? `${f.time_label}${f.approximate ? ' (approximate)' : ''}` : null, approx: f.approximate, sample: f.sample, notes }
  }

  if (on.has('overview')) {
    const c = chapter('overview', 'Overview')
    const s = section('overview-body')
    s.paras.push({ text: `${plural(b.counts.facts, 'canon fact')} · ${plural(b.counts.entities, 'entity', 'entities')} · ${plural(b.counts.documents, 'source document')}` },
      { text: `Scope: ${b.scope.label}. Medium: ${b.medium}.`, kind: 'small' },
      { text: 'Only accepted canon. Every fact carries the exact words of the source it rests on, as a numbered note at the end of its chapter.' })
    if (b.counts.sample) s.paras.push({ text: `${plural(b.counts.sample, 'fact')} marked “Sample canon (preloaded)” came with a sample project: their quotes are verified, but no person decided them.`, kind: 'small' })
    if (b.counts.stale) s.paras.push({ text: `${plural(b.counts.stale, 'fact cites', 'facts cite')} an older version of its source. Re-check before relying on them.`, kind: 'small' })
    c.sections.push(s)
  }
  if (on.has('entities') || on.has('facts')) {
    for (const t of b.types) {
      const group = b.entities.filter(e => e.kind === t.key && (on.has('entities') || e.facts.length))
      if (!group.length) continue
      const c = chapter(`kind-${t.key}`, t.many)
      for (const e of group) {
        const s = section(e.key, e.name, { sub: e.aliases.length ? `Also known as ${e.aliases.join(', ')}` : '', portrait: e.portrait, portraitKey: e.key })
        if (e.editorial) {
          s.paras.push({ text: 'Editorial note, not canon', kind: 'ed' })
          if (e.editorial.summary) s.paras.push({ text: e.editorial.summary })
          for (const fl of e.editorial.fields) s.paras.push({ text: `${fl.label}: ${fl.value}`, kind: 'small' })
          if (e.editorial.notes) s.paras.push({ text: e.editorial.notes })
        }
        s.facts = e.facts.map(n => bookFact(c, n))
        if (e.named_in.length) s.paras.push({ text: `${e.facts.length ? 'Also named in' : 'Named in'} ${e.named_in.join(', ')}`, kind: 'small' })
        c.sections.push(s)
      }
    }
  }
  if (on.has('facts') && b.other_facts.length) {
    const c = chapter('other-canon', 'Other canon', 'Canon that names no entity page.')
    c.sections.push(section('other-canon-body', '', { facts: b.other_facts.map(n => bookFact(c, n)) }))
  }
  if (b.rules.length) {
    const c = chapter('rules', 'World rules')
    c.sections.push(section('rules-body', '', { facts: b.rules.map(n => bookFact(c, n)) }))
  }
  if (b.timeline.length) {
    const c = chapter('timeline', 'Timeline', 'Timed canon in story order. Day 1 starts at 00:00. Sources are in the chapters above, under the fact number.')
    c.sections.push(section('timeline-body', '', { facts: b.timeline.map(n => bookFact(c, n, false)) }))
  }
  if (on.has('conflicts')) {
    const c = chapter('conflicts', 'Open conflicts (not canon)', b.conflicts.length ? 'Flagged as possible clashes in canon. Nobody has judged them yet; they are questions for the team, not canon.' : 'No open conflicts in this scope.')
    for (const [i, x] of b.conflicts.entries())
      c.sections.push(section(`conflict-${i}`, `${x.rule}${x.model ? ' (model-suggested)' : ''}`, { paras: [{ text: x.rationale }, { text: `Between ${x.facts.join(' and ')}`, kind: 'small' }] }))
  }
  // Facts only the timeline or conflicts refer to are given in full, so every number in the book can be looked up.
  const extra = b.facts.filter(f => !shownElsewhere(b, f.n)).map(f => f.n)
  if (extra.length) {
    const c = chapter('referenced', 'Facts referenced above')
    c.sections.push(section('referenced-body', '', { facts: extra.map(n => bookFact(c, n)) }))
  }
  if (b.sources.length) {
    const c = chapter('sources', 'Sources', 'Every document a fact cites, at the version it cites. Sources are kept read-only.')
    for (const [i, s] of b.sources.entries()) {
      c.sections.push(section(`source-${i}`, s.document, {
        sub: `${[s.folder, s.file].filter(Boolean).join(' / ')} · ${s.kind} · v${s.version}${s.latest_version > s.version ? ` (latest v${s.latest_version})` : ''} · sha256 ${s.sha256}…`,
        paras: s.citations.map(ct => ({ text: `${ct.fact}${lineLabel(ct) ? `, ${lineLabel(ct)}` : ''}: “${ct.quote.replace(/\n+/g, ' ')}”`, kind: 'small' as const })),
      }))
    }
  }
  return { kicker: 'Story bible', title: b.title, studio: b.studio, line: `${b.scope.label} · generated ${shortDate(b.generated_at)}`, cover: b.cover ?? null, chapters }
}

// Manuscript text → paragraphs. A line starting with # is a heading; the first one repeating the chapter title is dropped.
export function manuscriptBook(m: Manuscript): Book {
  const chapters: BookChapter[] = m.chapters.map((d) => {
    const paras: BookPara[] = []
    for (const block of d.text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(x => x.trim()).filter(Boolean)) {
      const h = /^#{1,6}\s+(.*)$/.exec(block)
      if (h && !block.includes('\n')) {
        if (!paras.length && h[1]!.trim() === d.title) continue
        paras.push({ text: h[1]!.trim(), kind: 'h' })
      } else paras.push({ text: block })
    }
    return { id: d.key, title: d.title, intro: '', notes: [], sections: [section(`${d.key}-body`, '', { paras })] }
  })
  return { kicker: 'Manuscript', title: m.title, studio: m.studio, line: `${m.scope.label} · ${plural(m.counts.documents, 'document')}, ${m.counts.words.toLocaleString('en-GB')} words · generated ${shortDate(m.generated_at)}`, cover: m.cover, chapters, flow: true }
}
