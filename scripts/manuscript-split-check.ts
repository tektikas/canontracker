// Self-check for splitManuscript (shared/utils/manuscript.ts): which texts become one document per chapter, and how.
// Run: node scripts/manuscript-split-check.ts [a Gutenberg plain-text book, e.g. pg345.txt (Dracula), to print its split]
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cleanTitle, numberValue, splitManuscript } from '../shared/utils/manuscript.ts'

// Prose that never looks like a heading: wrapped paragraphs of `n` words.
let seed = 1
const prose = (n: number) => {
  const vocab = 'the lamp was lit and she walked down to the harbour where the boats lay quiet under a grey sky while gulls cried over water'.split(' ')
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(vocab[(seed = (seed * 31 + 7) % 997) % vocab.length]!)
  const paras: string[] = []
  for (let i = 0; i < out.length; i += 120) paras.push(out.slice(i, i + 120).join(' ').replace(/(.{1,70})(\s|$)/g, '$1\n').trim() + '.')
  return paras.join('\n\n')
}
const titles = (t: ReturnType<typeof splitManuscript>) => t.parts.map(p => p.title)
let cases = 0
const check = (name: string, fn: () => void) => { fn(); cases++; console.log(`ok  ${name}`) }

check('Gutenberg "CHAPTER I." book: header and licence dropped, contents block is front matter, title from the next line', () => {
  const text = [
    'The Project Gutenberg eBook of The Lantern Keeper', '', 'Title: The Lantern Keeper', '', 'Author: Nobody', '',
    '*** START OF THE PROJECT GUTENBERG EBOOK THE LANTERN KEEPER ***', '', '', 'THE LANTERN KEEPER', '', 'by Nobody', '', '', 'CONTENTS', '',
    ' CHAPTER I.     The Harbour', '', ' CHAPTER II.    The Lamp', '', ' CHAPTER III.   The Storm', '', '',
    'CHAPTER I.', 'The Harbour', '', prose(900), '', '',
    'CHAPTER II.', 'The Lamp', '', prose(900), '', '',
    'CHAPTER III.', 'THE STORM', '', prose(900), '', 'THE END', '',
    '*** END OF THE PROJECT GUTENBERG EBOOK THE LANTERN KEEPER ***', '', 'Section 1. General Terms of Use', prose(200),
  ].join('\r\n')
  const m = splitManuscript(text, 'pg999.txt')
  assert.equal(m.how, 'chapters')
  assert.equal(m.book, 'The Lantern Keeper')
  assert.deepEqual(titles(m), ['The Lantern Keeper — Front matter', 'The Lantern Keeper — Chapter 1: The Harbour', 'The Lantern Keeper — Chapter 2: The Lamp', 'The Lantern Keeper — Chapter 3: The Storm'])
  assert.deepEqual(m.parts.map(p => p.filename), ['the-lantern-keeper-ch-000.md', 'the-lantern-keeper-ch-001.md', 'the-lantern-keeper-ch-002.md', 'the-lantern-keeper-ch-003.md'])
  assert.deepEqual(m.parts.map(p => p.kind), ['lore', 'scene', 'scene', 'scene'])
  assert.match(m.parts[0]!.text, /CONTENTS[\s\S]*CHAPTER III\.\s+The Storm/)
  assert.ok(m.parts[1]!.text.startsWith('CHAPTER I.\nThe Harbour\n'), 'a chapter keeps its own heading lines, \\n line ends')
  // Each part says where it starts in the uploaded file (Word comments are pinned by it).
  for (const p of m.parts) assert.equal(text.split(/\r?\n/)[p.line - 1], p.text.split('\n')[0], `line of ${p.label}`)
  assert.ok(m.parts[3]!.text.trimEnd().endsWith('THE END'), '"THE END" stays with the last chapter')
  assert.ok(!m.parts.some(p => /General Terms|START OF THE PROJECT/.test(p.text)), 'Gutenberg header and licence dropped')
  assert.equal(m.dropped.length, 2)
  // Same text, same parts: a re-upload finds every chapter again.
  assert.deepEqual(splitManuscript(text, 'pg999.txt'), m)
})

check('Markdown "#" chapters with a "# Title" line become chapters; the book is named by its title heading', () => {
  const text = `# The Salt Road\n\nA novel.\n\n## The Gate\n\n${prose(3500)}\n\n## The Ferry\n\n${prose(3500)}\n\n## The Crossing\n\n${prose(3500)}\n`
  const m = splitManuscript(text, 'draft-final.md')
  assert.equal(m.how, 'headings')
  assert.deepEqual(titles(m), ['The Salt Road — The Gate', 'The Salt Road — The Ferry', 'The Salt Road — The Crossing'])
  assert.ok(m.parts[0]!.text.startsWith('# The Salt Road\n\nA novel.\n\n## The Gate\n'), 'a title-only front matter opens chapter 1')
  assert.ok(m.parts[1]!.text.startsWith('## The Ferry\n'))
  // The same headings in a short story (under 10,000 words) leave it whole.
  assert.equal(splitManuscript(`# A Scandal\n\n## I\n\n${prose(2800)}\n\n## II\n\n${prose(2800)}\n\n## III\n\n${prose(2800)}\n`, 'scandal.md').parts.length, 0)
})

check('Word (.docx) text: Title style "#", "# Chapter 1" headings, a "# Notes" section stays with the last chapter', () => {
  // What server/utils/docx.ts makes of a manuscript: one paragraph per block, headings as "#", emphasis as ** / *.
  const text = `# Dracula\n\nby Bram Stoker\n\n# Chapter 1\n\n${prose(800)}\n\n# Chapter 2\n\n**Mina Murray's Journal**\n\n${prose(800)}\n\n# Chapter 3\n\n${prose(800)}[^1]\n\n# Notes\n\n[^1]: A footnote.\n`
  const m = splitManuscript(text, 'Dracula.docx')
  assert.equal(m.how, 'chapters')
  assert.equal(m.book, 'Dracula')
  assert.deepEqual(titles(m), ['Dracula — Chapter 1', "Dracula — Chapter 2: Mina Murray's Journal", 'Dracula — Chapter 3'])
  assert.ok(m.parts[0]!.text.startsWith('# Dracula\n\nby Bram Stoker\n\n# Chapter 1\n'), 'the title page (a few words) opens chapter 1')
  assert.match(m.parts.at(-1)!.text, /# Notes\n\n\[\^1\]: A footnote\.\n$/)
})

check('"Chapter One" words, "Chapter the First", Prologue and Epilogue', () => {
  const text = `Prologue\n\n${prose(500)}\n\nChapter One: The Bell\n\n${prose(700)}\n\nChapter Two\n\n${prose(700)}\n\nCHAPTER TWENTY-ONE\n\n${prose(700)}\n\nChapter the Twenty-Second\n\n${prose(300)}\n\nEpilogue\n\n${prose(300)}\n`
  const m = splitManuscript(text, 'the_bell.txt')
  assert.equal(m.how, 'chapters')
  assert.deepEqual(m.parts.map(p => p.label), ['Prologue', 'Chapter 1', 'Chapter 2', 'Chapter 21', 'Chapter 22', 'Epilogue'])
  assert.equal(m.parts[1]!.title, 'the bell — Chapter 1: The Bell')
  assert.equal(m.parts[0]!.n, 1, 'no front matter when the text opens with a heading')
  assert.equal(numberValue('the Twenty-Second'), 22)
  assert.equal(numberValue('XLIV'), 44)
  assert.equal(numberValue('nineteenth'), 19)
})

check('Part headings open the chapter after them; a contents block with one entry per paragraph is not split', () => {
  const toc = ['Contents', '', 'Part One', '', 'Chapter 1. Arrival', '', 'Chapter 2. Departure', '', 'Part Two', '', 'Chapter 3. Return'].join('\n')
  const text = `${toc}\n\n\nPART ONE\n\nChapter 1. Arrival\n\n${prose(800)}\n\nChapter 2. Departure\n\n${prose(800)}\n\nPART TWO\n\nThe sea, later.\n\nChapter 3. Return\n\n${prose(800)}\n`
  const m = splitManuscript(text, 'Tides.md')
  assert.deepEqual(m.parts.map(p => p.label), ['Front matter', 'Chapter 1', 'Chapter 2', 'Chapter 3'])
  assert.ok(m.parts[1]!.text.startsWith('PART ONE\n\nChapter 1. Arrival'), 'the Part heading opens chapter 1')
  assert.ok(m.parts[3]!.text.startsWith('PART TWO\n\nThe sea, later.\n\nChapter 3.'), 'a Part with a line under it joins chapter 3')
  assert.match(m.parts[0]!.text, /Chapter 2\. Departure\n\nPart Two\n\nChapter 3\. Return\n$/)
})

check('Gutenberg-style contents with lines in a block (no blank lines) never split', () => {
  const text = `DRACULA\n\nContents\n\nCHAPTER I. Jonathan Harker’s Journal\nCHAPTER II. Jonathan Harker’s Journal\nCHAPTER III. Letters\n\n\nCHAPTER I\n\nJONATHAN HARKER’S JOURNAL\n\n(_Kept in shorthand._)\n\n${prose(800)}\n\nCHAPTER II\n\nJONATHAN HARKER’S JOURNAL--_continued_\n\n${prose(800)}\n\nCHAPTER III\n\nLETTERS\n\n${prose(800)}\n`
  const m = splitManuscript(text, 'dracula.txt')
  assert.deepEqual(titles(m), ['dracula — Front matter', 'dracula — Chapter 1: Jonathan Harker’s Journal', 'dracula — Chapter 2: Jonathan Harker’s Journal--continued', 'dracula — Chapter 3: Letters'])
})

check('numbered headings ("1", "2." …) and roman-numeral-only lines split when they only go up', () => {
  const text = `1\n\n${prose(3500)}\n\n2.\n\n${prose(3500)}\n\n3\n\n${prose(3500)}\n`
  const m = splitManuscript(text, 'stories.txt')
  assert.equal(m.how, 'numbers')
  assert.deepEqual(m.parts.map(p => p.label), ['Chapter 1', 'Chapter 2', 'Chapter 3'])
  const r = splitManuscript(`I\n\n${prose(3500)}\n\nII\n\n${prose(3500)}\n\nIII\n\n${prose(3500)}\n`, 'stories.txt')
  assert.deepEqual(r.parts.map(p => p.label), ['Chapter 1', 'Chapter 2', 'Chapter 3'])
  // Numbers that jump back (a list, page numbers) are not chapters.
  assert.equal(splitManuscript(`1\n\n${prose(1100)}\n\n3\n\n${prose(1100)}\n\n2\n\n${prose(1100)}\n`, 'notes.txt').how, null, 'and under 8,000 words: one document')
})

check('a long text (over 12,000 words) without headings is cut at paragraph breaks into parts of about 5,000 words', () => {
  const text = prose(16_000)
  const m = splitManuscript(text, 'stream.txt')
  assert.equal(m.how, 'length')
  assert.deepEqual(titles(m), ['stream — Part 1', 'stream — Part 2', 'stream — Part 3'])
  assert.deepEqual(m.parts.map(p => p.filename), ['stream-part-001.md', 'stream-part-002.md', 'stream-part-003.md'])
  assert.ok(m.parts.every(p => p.words > 4000 && p.words < 7000), m.parts.map(p => p.words).join(','))
  assert.equal(m.parts.map(p => p.text.trim()).join('\n\n'), text.trim(), 'nothing lost or rewritten at the cuts')
  assert.equal(splitManuscript(prose(16_000).replace(/\n\n/g, ' '), 'one-paragraph.txt').parts.length, 0, 'one huge paragraph has nowhere to cut: one document')
})

check('short texts are not split, whatever their headings', () => {
  assert.equal(splitManuscript('Chapter 1\n\nHi.\n\nChapter 2\n\nBye.\n', 'two.md').parts.length, 0)
  assert.equal(splitManuscript(`# Harbour\n\n${prose(300)}\n\n# Lighthouse\n\n${prose(300)}\n`, 'lore.md').parts.length, 0, 'a lore page with sections')
  assert.equal(splitManuscript(prose(11_000), 'chapter-07.md').parts.length, 0, 'one long chapter under 12,000 words')
  assert.equal(splitManuscript(`# Chapter 4\n\n${prose(4000)}\n`, 'ch4.md').parts.length, 0, 'one chapter heading')
})

check('false positives: sentences that start like headings never split', () => {
  const text = [
    `Chapter 3 of the report says the lamp was lit.`, prose(900),
    `Part of the plan was simple.`, prose(900),
    `Book two copies before Friday.`, prose(900),
    `Chapter 4 explains why, and chapter 5 disagrees.`, prose(900),
    `1 in 3 sailors could not swim.`, prose(900),
  ].join('\n\n')
  const m = splitManuscript(text, 'essay.txt')
  assert.equal(m.parts.length, 0)
  // A heading line inside a paragraph (not on its own) is not a heading either.
  const glued = `Chapter 1\n${prose(1500)}\n\nChapter 2\n${prose(1500)}\n`
  assert.equal(splitManuscript(glued, 'glued.txt').parts.length, 0)
})

check('cleanTitle', () => {
  assert.equal(cleanTitle('DR. SEWARD’S PHONOGRAPH DIARY, SPOKEN BY VAN HELSING'), 'Dr. Seward’s Phonograph Diary, Spoken by Van Helsing')
  assert.equal(cleanTitle('_Letter from Miss Mina Murray to Miss Lucy Westenra._'), 'Letter from Miss Mina Murray to Miss Lucy Westenra')
  assert.equal(cleanTitle('Down the Rabbit-Hole'), 'Down the Rabbit-Hole')
})

const book = process.argv[2]
if (book) {
  const m = splitManuscript(readFileSync(book, 'utf8'), book.split('/').pop()!)
  console.log(`\n${book}: ${m.book} (${m.how}), ${m.parts.length} parts; dropped: ${m.dropped.join(', ') || 'nothing'}`)
  for (const p of m.parts) console.log(`  ${p.filename}  ${p.kind.padEnd(5)} ${String(p.words).padStart(6)} words  ${p.title}`)
}
console.log(`ok  splitManuscript: ${cases} cases`)
