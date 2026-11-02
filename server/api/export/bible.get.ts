// The story bible as a download (format=md, or zip with portraits) or as JSON for the print view (format=json).
// book=bible|manuscript: the same content laid out as a book (JSON for the book print view, format=epub for an EPUB); the
// manuscript is the source documents, latest versions, in reading order. epub without book is the bible as a book.
// Read-only, so viewers may export too: it holds only canon and sources they can already read. for=printed (sent when someone presses Save as PDF, not when the preview loads) logs the PDF export.
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const opts = cleanBibleOptions(q)
  const format = (['md', 'zip', 'epub'] as const).find(f => f === q.format) ?? 'json'
  const book: BibleBook | null = q.book === 'manuscript' ? 'manuscript' : q.book === 'bible' || format === 'epub' ? 'bible' : null
  if (book === 'manuscript' && opts.scope === 'entities') throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'The manuscript covers the whole project or one folder.' })
  const cover = (id: string) => `/api/images/${id}`
  const done = (scope: string, extra: object) => (log: string) => audit('bible.exported', 'project', pid(), { format: log, book, scope, sections: opts.sections, images: opts.images, ...extra })
  const send = (file: { filename: string, type: string, body: string | Buffer }) => {
    setHeaders(event, { 'content-type': file.type, 'content-disposition': `attachment; filename="${file.filename}"`, 'cache-control': 'no-store' })
    return file.body
  }

  if (book === 'manuscript') {
    const m = buildManuscript(opts, cover)
    const log = done(m.scope.label, { documents: m.counts.documents, words: m.counts.words })
    if (format === 'json') {
      if (q.for === 'printed') log('pdf')
      return m
    }
    log(format)
    if (format === 'epub') {
      const img = bookCover(opts)
      return send(epubDownload(manuscriptBook(m), 'manuscript', new Map(), img))
    }
    return send({ filename: `${m.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'project'}-manuscript.md`, type: 'text/markdown; charset=utf-8', body: manuscriptMarkdown(m) })
  }

  const { bible, rows, cited } = buildBible(opts, portraitUrl)
  const log = done(bible.scope.label, { facts: bible.counts.facts, entities: bible.counts.entities })
  const img = book ? bookCover(opts, cited) : null
  if (format === 'json') {
    if (q.for === 'printed') log('pdf')
    return book ? { ...bible, cover: img ? cover(img.id) : null } : bible
  }
  log(format)
  if (format === 'epub') return send(epubDownload(bibleBook(bible), 'bible', rows, img))
  return send(bibleDownload(bible, rows, format === 'zip'))
})
