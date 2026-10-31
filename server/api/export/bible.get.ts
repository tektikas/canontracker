// The story bible as a download (format=md, or zip with portraits) or as JSON for the print view (format=json).
// Read-only, so viewers may export too: it holds only canon they can already read. for=print logs the PDF export.
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const opts = cleanBibleOptions(q)
  const { bible, rows } = buildBible(opts, portraitUrl)
  const format = q.format === 'md' || q.format === 'zip' ? q.format : 'json'
  const log = (as: string) => audit('bible.exported', 'project', pid(), { format: as, scope: bible.scope.label, sections: opts.sections, images: opts.images, facts: bible.counts.facts, entities: bible.counts.entities })
  if (format === 'json') {
    if (q.for === 'print') log('pdf')
    return bible
  }
  const file = bibleDownload(bible, rows, format === 'zip')
  log(format)
  setHeaders(event, { 'content-type': file.type, 'content-disposition': `attachment; filename="${file.filename}"`, 'cache-control': 'no-store' })
  return file.body
})
