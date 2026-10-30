// Markdown-lite for editorial notes: paragraphs, "- " lists, "# " headings, **bold**, *italic*, `code`.
// The text is HTML-escaped first, so only these tags can ever come out.
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)
const inline = (s: string) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')

export function notesHtml(src: string) {
  return src.trim().split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n')
    if (lines.every(l => /^\s*[-*]\s+/.test(l))) return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`
    const h = /^(#{1,3})\s+(.*)$/.exec(lines[0]!)
    if (h && lines.length === 1) return `<h3>${inline(h[2]!)}</h3>`
    return `<p>${lines.map(inline).join('<br>')}</p>`
  }).join('')
}
