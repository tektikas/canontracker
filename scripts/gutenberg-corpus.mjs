// Builds a chapter-per-document sample (server/assets/<set>/docs + manifest.json) from Project Gutenberg plain-text ebooks:
//   node scripts/gutenberg-corpus.mjs oz <dir holding 55.txt 54.txt 486.txt>      (pg55.txt etc. also found)
//   node scripts/gutenberg-corpus.mjs alice <dir holding 11.txt 12.txt>
// Sets are listed in SETS below; each book says how its chapter headings look. Everything outside the "*** START / END OF THE
// PROJECT GUTENBERG EBOOK ***" markers is dropped, as is everything before the first chapter (title page, dedication,
// author's note, contents, dramatis personae) and illustration placeholders ("[Illustration: …]") and "THE END" lines.
// The author's words are kept as they are; only the layout changes: hard-wrapped prose lines of a paragraph are joined with one
// space (verse keeps its lines), indentation is removed, and each document opens with a "# Book — Chapter N: Title" heading.
// Deterministic: the same ebooks give the same files. (scripts/sherlock-corpus.mjs is the older, Sherlock-only version.)
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

// head: a chapter heading line; its title is the next non-blank line (titleNext) or the line itself minus a leading number.
// isolated: a heading is a short line with at least three blank lines before it and a blank line after (no "Chapter" word).
// after: headings only count after this line (skips the contents). chapters: how many there must be.
const SETS = {
  oz: {
    books: [
      { n: 55, year: 1900, title: 'The Wonderful Wizard of Oz', head: /^Chapter [IVXL]+$/, titleNext: true, chapters: 24 },
      { n: 54, year: 1904, title: 'The Marvelous Land of Oz', isolated: true, after: /^LIST OF CHAPTERS$/, chapters: 24 },
      { n: 486, year: 1907, title: 'Ozma of Oz', isolated: true, after: /^Author's Note$/, chapters: 21 },
    ],
  },
  alice: {
    books: [
      { n: 11, year: 1865, title: 'Alice’s Adventures in Wonderland', head: /^CHAPTER [IVXL]+\.$/, titleNext: true, chapters: 12 },
      { n: 12, year: 1871, title: 'Through the Looking-Glass', head: /^CHAPTER [IVXL]+\.$/, titleNext: true, chapters: 12 },
    ],
  },
}

const [set, src] = process.argv.slice(2)
if (!SETS[set] || !src) throw new Error(`usage: gutenberg-corpus.mjs <${Object.keys(SETS).join('|')}> <gutenberg dir>`)
const out = new URL(`../server/assets/${set}/`, import.meta.url)
const body = (n) => {
  const file = [`${src}/${n}.txt`, `${src}/pg${n}.txt`].find(existsSync)
  if (!file) throw new Error(`${n}.txt not found in ${src}`)
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const start = text.indexOf('\n', text.search(/\*\*\* START OF THE PROJECT GUTENBERG EBOOK/)) + 1
  const end = text.search(/\*\*\* END OF THE PROJECT GUTENBERG EBOOK/)
  if (start <= 0 || end < 0) throw new Error(`${n}.txt: Gutenberg markers not found`)
  return text.slice(start, end).split('\n')
}
// A paragraph is verse when a line is indented or every line but the last is short (prose is wrapped near 70 characters).
const paragraphs = lines => lines.join('\n').split(/\n\s*\n/).map((p) => {
  const ls = p.split('\n').filter(l => l.trim())
  const verse = ls.length > 1 && (ls.some(l => /^\s/.test(l)) || ls.slice(0, -1).every(l => l.trim().length < 50))
  return ls.map(l => l.trim()).join(verse ? '\n' : ' ')
}).filter(p => p && !/^\[Illustration[^\]]*\]$/.test(p) && !/^the end\.?$/i.test(p))
const slug = s => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const blank = l => !l?.trim()

const docs = []
for (const book of SETS[set].books) {
  const l = body(book.n)
  const from = book.after ? l.findIndex(x => book.after.test(x.trim())) + 1 : 0
  if (from === 0 && book.after) throw new Error(`${book.n}: ${book.after} not found`)
  const heads = []
  for (let i = from; i < l.length; i++) {
    const x = l[i].trim()
    if (book.head && book.head.test(x)) {
      const t = l.findIndex((y, j) => j > i && y.trim())
      heads.push({ at: i, title: l[t].trim(), body: t + 1 })
    } else if (book.isolated && x && x.length < 60 && !x.startsWith('[') && blank(l[i - 1]) && blank(l[i - 2]) && blank(l[i - 3]) && blank(l[i + 1])) {
      heads.push({ at: i, title: x.replace(/^\d+\.\s+/, ''), body: i + 1 })
    }
  }
  if (heads.length !== book.chapters) throw new Error(`${book.title}: ${heads.length} chapter headings, expected ${book.chapters}: ${heads.map(h => h.title).join(' | ')}`)
  heads.forEach((h, k) => {
    const n = k + 1
    const paras = paragraphs(l.slice(h.body, heads[k + 1]?.at ?? l.length))
    docs.push({
      file: `${book.year}-${slug(book.title)}-${String(n).padStart(2, '0')}-${slug(h.title)}.md`,
      text: `# ${book.title} — Chapter ${n}: ${h.title}\n\n${paras.join('\n\n')}\n`,
      meta: { title: `${book.title}, ${n}: ${h.title}`, folder: book.title },
    })
  })
}

rmSync(new URL('docs/', out), { recursive: true, force: true })
mkdirSync(new URL('docs/', out), { recursive: true })
const manifest = { medium: 'prose', tags: {}, docs: {} }
let words = 0
for (const d of docs) {
  writeFileSync(new URL(`docs/${d.file}`, out), d.text)
  const w = d.text.split(/\s+/).filter(Boolean).length
  words += w
  manifest.docs[d.file] = { title: d.meta.title, kind: 'scene', folder: d.meta.folder, tags: [], words: w }
}
const prev = existsSync(new URL('manifest.json', out)) ? JSON.parse(readFileSync(new URL('manifest.json', out), 'utf8')) : {}
if (prev.cover) manifest.cover = prev.cover // the cover is chosen by hand (SOURCES.md); a rebuild keeps it
writeFileSync(new URL('manifest.json', out), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`${docs.length} documents, ${words} words`)
