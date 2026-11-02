/** Content-Disposition for a download: a plain ASCII name for every client, plus the exact name (RFC 5987) for those that read
 * it. A raw non-Latin-1 name (a project called "Kırık Gelgit") would make the header invalid and the response a 500. */
export function attachment(filename: string, fallback = 'download') {
  const dot = filename.lastIndexOf('.')
  const [base, ext] = dot > 0 ? [filename.slice(0, dot), filename.slice(dot)] : [filename, '']
  const ascii = base.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|-+$/g, '') || fallback
  const utf8 = encodeURIComponent(filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${ascii}${ext.replace(/[^\w.-]/g, '')}"; filename*=UTF-8''${utf8}`
}
