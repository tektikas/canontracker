// Builds the "Sherlock Holmes" sample (server/assets/sherlock-holmes/docs + manifest.json) from Project Gutenberg plain-text
// ebooks (see server/assets/sherlock-holmes/SOURCES.md for numbers and URLs):
//   node scripts/sherlock-corpus.mjs <dir holding 244.txt 2097.txt 1661.txt 834.txt>
// Everything outside the "*** START / END OF THE PROJECT GUTENBERG EBOOK ***" markers (licence, header, footer, trademark) is
// dropped, as are each book's title page and contents. One document per chapter (novels) or per story. Doyle's words are kept
// as they are; the only changes are layout: hard-wrapped lines of a paragraph are joined with one space, indentation is
// removed, and each document opens with a "# Work — Chapter" heading. Deterministic: the same ebooks give the same files.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const src = process.argv[2]
if (!src) throw new Error('usage: sherlock-corpus.mjs <gutenberg dir>')
const out = new URL('../server/assets/sherlock-holmes/', import.meta.url)
const body = (n) => {
  const text = readFileSync(`${src}/${n}.txt`, 'utf8').replace(/\r\n/g, '\n')
  const start = text.indexOf('\n', text.search(/\*\*\* START OF THE PROJECT GUTENBERG EBOOK/)) + 1
  const end = text.search(/\*\*\* END OF THE PROJECT GUTENBERG EBOOK/)
  if (start <= 0 || end < 0) throw new Error(`${n}.txt: Gutenberg markers not found`)
  return text.slice(start, end).split('\n')
}
// Lines between two heading lines (line numbers found by pattern, first match after `from`).
const find = (lines, re, from = 0) => { const i = lines.findIndex((l, j) => j >= from && re.test(l.trim())); if (i < 0) throw new Error(`not found: ${re}`); return i }
const paragraphs = lines => lines.join('\n').split(/\n\s*\n/).map(p => p.split('\n').map(l => l.trim()).filter(Boolean).join(' ')).filter(Boolean)
const slug = s => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const title = s => s.toLowerCase().replace(/(^|[\s(“-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Of|The|In|A|An|And|To|With|On)\b/g, (w, _a, i) => (i ? w.toLowerCase() : w)).replace(/\bM\.d\./, 'M.D.')
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 }

const docs = []
const add = (file, heading, paras, meta) => docs.push({ file, text: `# ${heading}\n\n${paras.join('\n\n')}\n`, meta })

// A Study in Scarlet (1887): Part I and Part II, seven chapters each. The "Reminiscences of John H. Watson" line opens Part I.
{
  const l = body(244)
  const part1 = find(l, /^PART I\.$/, find(l, /^PART I\.$/) + 1) // the first one is in the contents
  const part2 = find(l, /^PART II\.$/, part1 + 1)
  for (const [p, from, to] of [[1, part1, part2], [2, part2, l.length]]) {
    const heads = l.map((x, i) => [x.trim(), i]).filter(([x, i]) => i >= from && i < to && /^CHAPTER [IVX]+\.$/.test(x))
    heads.forEach(([h, i], k) => {
      const n = ROMAN[h.slice(8, -1)]
      const name = title(l[i + 1].trim().replace(/\.$/, ''))
      const pre = p === 1 && n === 1 ? paragraphs(l.slice(from + 1, i)).map(x => x.replace(/^\(|\)$/g, '')) : []
      const end = heads[k + 1]?.[1] ?? to
      add(`1887-a-study-in-scarlet-${p}-${String(n).padStart(2, '0')}-${slug(name)}.md`, `A Study in Scarlet — Part ${p === 1 ? 'I' : 'II'}, Chapter ${h.slice(8, -1)}: ${name}`,
        [...pre, ...paragraphs(l.slice(i + 2, end)).filter(x => !(p === 2 && n === 1 && /^THE COUNTRY OF THE SAINTS\.?$/.test(x)))],
        { title: `A Study in Scarlet, ${p === 1 ? 'I' : 'II'}.${n}: ${name}`, folder: 'A Study in Scarlet', tags: ['novel'] })
    })
  }
}
// The Sign of the Four (1890): twelve chapters.
{
  const l = body(2097)
  const heads = l.map((x, i) => [x.trim(), i]).filter(([x, i]) => /^Chapter [IVX]+$/.test(x))
  heads.forEach(([h, i], k) => {
    const name = l[i + 1].trim()
    const n = ROMAN[h.slice(8)]
    add(`1890-the-sign-of-the-four-${String(n).padStart(2, '0')}-${slug(name)}.md`, `The Sign of the Four — Chapter ${h.slice(8)}: ${name}`,
      paragraphs(l.slice(i + 2, heads[k + 1]?.[1] ?? l.length)), { title: `The Sign of the Four, ${n}: ${name}`, folder: 'The Sign of the Four', tags: ['novel'] })
  })
}
// Short stories, one document each, filed under the collection they were published in.
const STORIES = [
  [1661, 'The Adventures of Sherlock Holmes', 1891, /^I\. A SCANDAL IN BOHEMIA$/, /^II\. THE RED-HEADED LEAGUE$/, 'A Scandal in Bohemia'],
  [1661, 'The Adventures of Sherlock Holmes', 1891, /^V\. THE FIVE ORANGE PIPS$/, /^VI\. THE MAN WITH THE TWISTED LIP$/, 'The Five Orange Pips'],
  [1661, 'The Adventures of Sherlock Holmes', 1891, /^VI\. THE MAN WITH THE TWISTED LIP$/, /^VII\. THE ADVENTURE OF THE BLUE CARBUNCLE$/, 'The Man with the Twisted Lip'],
  [1661, 'The Adventures of Sherlock Holmes', 1892, /^X\. THE ADVENTURE OF THE NOBLE BACHELOR$/, /^XI\. THE ADVENTURE OF THE BERYL CORONET$/, 'The Adventure of the Noble Bachelor'],
  [834, 'The Memoirs of Sherlock Holmes', 1893, /^X\. The Greek Interpreter$/, /^XI\. The Naval Treaty$/, 'The Greek Interpreter'],
]
for (const [n, book, year, from, to, name] of STORIES) {
  const l = body(n)
  const a = find(l, from, n === 834 ? 35 : 25), b = find(l, to, a + 1) // past each book's contents
  // A story in parts ("I.", "II.") keeps them as headings.
  const parts = []
  let cur = []
  for (const line of l.slice(a + 1, b)) {
    if (/^[IVX]+\.$/.test(line.trim())) { parts.push(...paragraphs(cur)); parts.push(`## ${line.trim().slice(0, -1)}`); cur = [] } else cur.push(line)
  }
  parts.push(...paragraphs(cur))
  add(`${year}-${slug(name)}.md`, name, parts, { title: name, folder: book, tags: ['short-story'] })
}

// Documents holding one side of a well-known contradiction (gold.json) are tagged "crux".
const CRUX = ['1887-a-study-in-scarlet-1-01-mr-sherlock-holmes.md', '1887-a-study-in-scarlet-1-02-the-science-of-deduction.md', '1890-the-sign-of-the-four-01-the-science-of-deduction.md',
  '1890-the-sign-of-the-four-02-the-statement-of-the-case.md', '1890-the-sign-of-the-four-08-the-baker-street-irregulars.md', '1891-a-scandal-in-bohemia.md', '1891-the-five-orange-pips.md',
  '1891-the-man-with-the-twisted-lip.md', '1892-the-adventure-of-the-noble-bachelor.md']
rmSync(new URL('docs/', out), { recursive: true, force: true })
mkdirSync(new URL('docs/', out), { recursive: true })
const manifest = { medium: 'prose', tags: { 'novel': 'accent', 'short-story': 'good', 'crux': 'warn' }, docs: {} }
let words = 0
for (const d of docs) {
  writeFileSync(new URL(`docs/${d.file}`, out), d.text)
  const w = d.text.split(/\s+/).filter(Boolean).length
  words += w
  manifest.docs[d.file] = { title: d.meta.title, kind: 'scene', folder: d.meta.folder, tags: [...d.meta.tags, ...(CRUX.includes(d.file) ? ['crux'] : [])], words: w }
}
for (const f of CRUX) if (!manifest.docs[f]) throw new Error(`crux document missing: ${f}`)
writeFileSync(new URL('manifest.json', out), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`${docs.length} documents, ${words} words`)
