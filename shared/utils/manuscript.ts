// A whole book in one file → one document per chapter (server/api/documents/index.post.ts imports each part). Pure: the same
// text gives the same parts, so a re-upload finds every chapter again by its file name (`<book-slug>-ch-007.md`, by position).
//
// What counts as a chapter heading (a line of at most 80 characters; plain lines must stand alone between blank lines, Markdown
// `#` lines need not; `*`/`_` emphasis around it is ignored):
// - a chapter word with a number: "Chapter 1", "CHAPTER IV.", "Chapter One", "Chapter Twenty-One", "Chapter the First", "Chap. 3",
//   with an optional title after ". ", ": ", " — " or " - " ("Chapter 3: The Bell"). A sentence never matches ("Chapter 3 of the
//   report says…": nothing but a title may follow the number).
// - Part / Book / Volume with a number, and Prologue / Epilogue / Interlude / Afterword / Coda (alone or with a title).
// - when no chapter words are found: Markdown headings (Word heading styles arrive as `#`), at the shallowest level used twice;
//   else a number alone on its line ("7", "12.", "IV"), when those numbers only go up.
// The chapter's title is the rest of its heading line or, when that line is only "CHAPTER I", the next line if it is short and
// stands alone ("JONATHAN HARKER’S JOURNAL" → "Jonathan Harker’s Journal").
// Guards: a run of two or more headings at the start with (almost) no text under them is a table of contents and goes to the
// front matter; a Part heading with little under it, or a heading with nothing under it, joins the chapter after it. A split
// needs at least two chapters and, so short files and single chapters import as they always did, enough text: 2,000 words with
// chapter words, else 10,000 words and 500 words per chapter on average (a short story with "## I / ## II" sections stays one).
// A text over 12,000 words without headings is cut at paragraph breaks into parts of about 5,000 words ("<Book> — Part 3"); a
// long chapter on its own stays whole.
// Front matter under 50 words without a contents block (a title line) opens the first chapter instead of being a document of its own.
// Front matter (title page, dedication, contents: everything before the first chapter) is one reference document. Anything after
// the last chapter (an afterword without a heading, "THE END", a publisher's list) stays with the last chapter. Dropped: only a
// Project Gutenberg header and licence, outside its "*** START / END OF THE PROJECT GUTENBERG EBOOK" lines (listed in `dropped`).
// The text of each part is the file's own lines (line endings made \n, blank lines at either end trimmed); nothing is rewritten.

// line: where the part's text starts in the uploaded text (1-based; Word comments are pinned by it).
export interface SplitPart { n: number, filename: string, title: string, label: string, kind: 'scene' | 'lore', text: string, words: number, line: number }
export interface SplitBook { book: string, slug: string, how: 'chapters' | 'headings' | 'numbers' | 'length' | null, parts: SplitPart[], dropped: string[] }

const SMALL = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen'
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety'
const WORD_NUM = `(?:(?:${TENS})(?:[-\\s](?:${SMALL.split('|').slice(0, 9).join('|')}))?|${SMALL}|(?:one\\s+)?hundred)`
const NUM = `(\\d{1,3}|[ivxlc]{1,7}|${WORD_NUM}|the\\s+[a-z]+(?:-[a-z]+)?(?:st|nd|rd|th))`
const REST = '(?:\\s*[.:—–-]\\s*(.*?))?\\.?'
const CHAPTER = new RegExp(`^(?:chapter|chap\\.)\\s+${NUM}\\.?${REST}$`, 'i')
const PART = new RegExp(`^(part|book|volume)\\s+${NUM}\\.?${REST}$`, 'i')
const SPECIAL = /^(prologue|epilogue|interlude|afterword|coda)\.?(?:\s*[.:—–-]\s*(.*?))?\.?$/i
const NUMBER = /^(\d{1,3}|[IVXLC]{1,7})\.?$/
const MD = /^(#{1,6})\s+(.+?)\s*#*\s*$/

const words = (s: string) => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 }
function roman(s: string) {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]!]!, next = ROMAN[s[i + 1]!] ?? 0
    n += v < next ? -v : v
  }
  return n
}
const SMALL_N = SMALL.split('|')
const TENS_N = TENS.split('|')
const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fifth: 5, eighth: 8, ninth: 9, twelfth: 12 }
function wordValue(w: string): number | null {
  if (SMALL_N.includes(w)) return SMALL_N.indexOf(w) + 1
  if (TENS_N.includes(w)) return (TENS_N.indexOf(w) + 2) * 10
  if (ORD[w]) return ORD[w]!
  if (w.endsWith('ieth')) return wordValue(`${w.slice(0, -4)}y`)
  if (w.endsWith('th')) return wordValue(w.slice(0, -2)) ?? wordValue(`${w.slice(0, -2)}e`) ?? wordValue(`${w.slice(0, -1)}`)
  return null
}
/** "IV" → 4, "Twenty-One" → 21, "the First" → 1, "12" → 12; null when it isn't a number we read. */
export function numberValue(s: string): number | null {
  const t = s.toLowerCase().replace(/^the\s+/, '').trim()
  if (/^\d+$/.test(t)) return Number(t)
  if (/^[ivxlc]+$/.test(t)) return roman(t) || null
  if (/hundred/.test(t)) return 100
  const ws = t.split(/[-\s]+/)
  const vs = ws.map(wordValue)
  if (vs.some(v => v == null)) return null
  return vs.reduce((a, b) => a! + b!, 0)
}

// "JONATHAN HARKER’S JOURNAL" → "Jonathan Harker’s Journal"; mixed case stays as written. Emphasis marks and a closing full stop go.
const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with'])
export function cleanTitle(s: string) {
  const t = s.replace(/[*_]+/g, '').replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim()
  if (!shouting(t)) return t
  return t.replace(/[\p{L}\p{N}][\p{L}\p{N}’']*/gu, (w: string, i: number) => {
    if (w !== w.toUpperCase()) return w // "--continued" after a capitals heading keeps its case
    const l = w.toLowerCase()
    return i > 0 && MINOR.has(l) && !/[“"‘(]$/.test(t.slice(0, i)) ? l : l[0]!.toUpperCase() + l.slice(1)
  })
}
// Mostly capitals: "DR. SEWARD’S DIARY--continued".
const shouting = (s: string) => (s.match(/\p{Lu}/gu)?.length ?? 0) > (s.match(/\p{Ll}/gu)?.length ?? 0)
export const bookSlug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'manuscript'

type Kind = 'chapter' | 'part' | 'special' | 'number' | 'heading'
interface Head { at: number, kind: Kind, level: number, label: string, sub: string, value: number | null, titleLine: number | null }

function classify(raw: string): Omit<Head, 'at' | 'titleLine' | 'level'> | null {
  const t = raw.replace(/[*_]+/g, '').replace(/\s+/g, ' ').trim()
  if (!t || t.length > 80) return null
  let m = t.match(CHAPTER)
  if (m) { const v = numberValue(m[1]!); return { kind: 'chapter', label: `Chapter ${v ?? m[1]}`, sub: m[2] ?? '', value: v } }
  m = t.match(PART)
  if (m) { const v = numberValue(m[2]!); return { kind: 'part', label: `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1).toLowerCase()} ${v ?? m[2]}`, sub: m[3] ?? '', value: v } }
  m = t.match(SPECIAL)
  if (m) return { kind: 'special', label: `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1).toLowerCase()}`, sub: m[2] ?? '', value: null }
  m = t.match(NUMBER)
  if (m) return { kind: 'number', label: '', sub: '', value: numberValue(m[1]!) }
  return null
}

const GUTENBERG_START = /^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG E(?:BOOK|TEXT)\b.*$/im
const GUTENBERG_END = /^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG E(?:BOOK|TEXT)\b.*$/im

export const SPLIT = { minChapterWords: 2000, minWords: 10_000, minAverage: 500, longText: 12_000, partWords: 5000, tocBody: 20, partBody: 50, frontWords: 50 }

export function splitManuscript(input: string, filename: string): SplitBook {
  let text = input.replace(/\r\n?/g, '\n')
  const dropped: string[] = []
  let book = ''
  let offset = 0
  const start = text.match(GUTENBERG_START)
  if (start && start.index != null) {
    book = text.slice(0, start.index).match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? ''
    const head = text.slice(0, start.index + start[0].length)
    let rest = text.slice(start.index + start[0].length)
    const end = rest.match(GUTENBERG_END)
    offset = head.split('\n').length - 1
    dropped.push(`Project Gutenberg header (${offset + 1} lines)`)
    if (end && end.index != null) {
      dropped.push(`Project Gutenberg licence (${rest.slice(end.index).split('\n').length} lines)`)
      rest = rest.slice(0, end.index)
    }
    text = rest
  }
  const lines = text.split('\n')
  const blank = (i: number) => i < 0 || i >= lines.length || !lines[i]!.trim()
  const isolated = (i: number) => blank(i - 1) && blank(i + 1)

  // Every line that could be a heading.
  const heads: Head[] = []
  // A plain heading stands alone, or has its title on the very next line ("CHAPTER I." / "Down the Rabbit-Hole" / blank).
  const titled = (at: number) => blank(at - 1) && !blank(at + 1) && blank(at + 2) && lines[at + 1]!.trim().length <= 70
  lines.forEach((line, at) => {
    const md = line.match(MD)
    if (!md && !isolated(at) && !titled(at)) return
    const c = classify(md ? md[2]! : line)
    if (c && !md && !isolated(at) && c.kind === 'number') return
    if (c) heads.push({ ...c, at, level: md ? md[1]!.length : 0, titleLine: null })
    else if (md) heads.push({ kind: 'heading', at, level: md[1]!.length, label: cleanTitle(md[2]!), sub: '', value: null, titleLine: null })
  })

  const total = words(text)
  const nameOf = () => cleanTitle(book || filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')) || 'Manuscript'

  // Which headings split, strongest signal first.
  const of = (...k: Kind[]) => heads.filter(h => k.includes(h.kind))
  let how: SplitBook['how'] = null
  let cuts: Head[] = []
  if (of('chapter').length >= 2 && total >= SPLIT.minChapterWords) {
    how = 'chapters'
    cuts = of('chapter', 'part', 'special')
  } else {
    const levels = [1, 2, 3, 4, 5, 6].filter(l => heads.filter(h => h.level === l).length >= 2)
    const numbers = of('number').filter((h, i, a) => h.level === 0 && h.value != null && (i === 0 || h.value > a[i - 1]!.value!))
    if (levels.length) {
      how = 'headings'
      cuts = heads.filter(h => h.level === levels[0] || (h.kind === 'special' || h.kind === 'part'))
    } else if (numbers.length >= 2 && numbers.length === of('number').filter(h => h.level === 0).length) {
      how = 'numbers'
      cuts = [...numbers, ...of('special')].sort((a, b) => a.at - b.at)
    }
    if (how && (total < SPLIT.minWords || total / cuts.length < SPLIT.minAverage)) { how = null; cuts = [] }
  }

  // A heading that is only "CHAPTER I": its title is the next line when that is short and stands alone.
  for (const h of cuts) {
    if (h.sub || h.kind === 'heading') continue
    const n = lines.findIndex((l, j) => j > h.at && l.trim())
    if (n < 0 || !(isolated(n) || (n === h.at + 1 && blank(n + 1))) || cuts.some(c => c.at === n)) continue
    const t = lines[n]!.trim()
    if (t.length <= 70 && words(t) <= 10 && !/^["“‘'(\-—[]/.test(t) && !/[,;]$/.test(t) && (!/[.!?…]$/.test(t) || shouting(t)) && !MD.test(t)) { h.sub = t; h.titleLine = n }
  }
  const segments = cuts.map((h, k) => ({ h, from: h.at, to: cuts[k + 1]?.at ?? lines.length, heads: [h] }))
  const body = (s: typeof segments[number]) => words(lines.slice(Math.max(s.from, ...s.heads.map(h => (h.titleLine ?? h.at) + 1)), s.to).join('\n'))
  // Contents: two or more headings in a row at the start with (almost) nothing under them.
  let toc = 0
  while (toc < segments.length && body(segments[toc]!) < SPLIT.tocBody) toc++
  while (toc > 0 && toc < segments.length && segments[toc - 1]!.h.kind === 'part') toc-- // the real "PART ONE" right before chapter 1
  if (toc < 2 || toc === segments.length) toc = 0
  const kept = segments.slice(toc)
  // A Part heading with little under it, or any heading with nothing under it, opens the chapter after it.
  for (let k = kept.length - 2; k >= 0; k--) {
    const s = kept[k]!
    if ((s.h.kind === 'part' && body(s) < SPLIT.partBody) || body(s) === 0) {
      const next = kept[k + 1]!
      kept.splice(k, 2, { ...next, from: s.from, heads: [...s.heads, ...next.heads] })
    }
  }
  const frontEnd = kept[0]?.from ?? 0
  const slice = (from: number, to: number) => `${lines.slice(from, to).join('\n').replace(/^\s*\n/, '').replace(/\s+$/, '')}\n`
  const lineOf = (from: number) => { let i = from; while (i < lines.length && blank(i)) i++; return offset + i + 1 }

  const firstMd = heads.find(h => h.kind === 'heading' && h.level === 1 && h.at < frontEnd && !kept.some(s => s.heads.includes(h)))
  if (!book && firstMd) book = firstMd.label
  const name = nameOf()
  const slug = bookSlug(name)
  const pad = (n: number) => String(n).padStart(3, '0')

  if (kept.length >= 2) {
    const parts: SplitPart[] = []
    const front = slice(0, frontEnd)
    if (!toc && words(front) < SPLIT.frontWords && !/^[#*_\s]*(?:table of )?contents[*_\s]*$/im.test(front)) kept[0]!.from = 0
    else parts.push({ n: 0, filename: `${slug}-ch-${pad(0)}.md`, title: `${name} — Front matter`, label: 'Front matter', kind: 'lore', text: front, words: words(front), line: lineOf(0) })
    kept.forEach((s, k) => {
      // The chapter's own heading names it (the last of a Part + Chapter pair); a bare number reads "Chapter 7".
      const h = s.heads.at(-1)!
      const label = h.kind === 'heading' ? h.label : h.kind === 'number' ? `Chapter ${h.value}` : h.label
      const sub = cleanTitle(h.sub)
      const t = slice(s.from, s.to)
      parts.push({ n: k + 1, filename: `${slug}-ch-${pad(k + 1)}.md`, title: `${name} — ${label}${sub && sub !== label ? `: ${sub}` : ''}`.slice(0, 120), label, kind: 'scene', text: t, words: words(t), line: lineOf(s.from) })
    })
    return { book: name, slug, how, parts, dropped }
  }

  // No headings to go by: a long text is cut at paragraph breaks into parts of about 5,000 words.
  if (total > SPLIT.longText) {
    const n = Math.round(total / SPLIT.partWords)
    const target = total / n
    const parts: SplitPart[] = []
    let from = 0, sum = 0
    const flush = (to: number) => {
      const t = slice(from, to)
      if (!words(t)) return
      const k = parts.length + 1
      parts.push({ n: k, filename: `${slug}-part-${pad(k)}.md`, title: `${name} — Part ${k}`, label: `Part ${k}`, kind: 'scene', text: t, words: words(t), line: lineOf(from) })
      from = to
    }
    for (let i = 0; i < lines.length; i++) {
      sum += words(lines[i]!)
      if (blank(i + 1) && !blank(i) && sum >= target * (parts.length + 1) && parts.length < n - 1) flush(i + 1)
    }
    flush(lines.length)
    if (parts.length >= 2) return { book: name, slug, how: 'length', parts, dropped } // one huge paragraph has nowhere to cut
  }
  return { book: name, slug, how: null, parts: [], dropped: [] }
}
