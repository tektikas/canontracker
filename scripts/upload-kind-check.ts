// Self-check for chapterLike (shared/utils/upload.ts): which uploaded file names a prose project files as scenes.
// Run: node scripts/upload-kind-check.ts
import assert from 'node:assert/strict'
import { chapterLike } from '../shared/utils/upload.ts'

const scenes = ['chapter-01.md', 'Chapter 3 - The Bell.docx', 'Chapter One.md', 'ch02.md', 'Ch 2 - The Bell.md', 'Book 2.md', 'book-03.md',
  'Part II.md', 'part_iv.txt', 'prologue.md', 'Epilogue - After.md', 'Interlude.md', '01 The Arrival.md', '1887-a-study-in-scarlet-1-01.md']
const lore = ['book-notes.md', 'notebook.md', 'facebook-posts.md', 'Part of the plan.md', 'book.md', 'chapters_outline.md', 'chi.md',
  'Book civil war notes.md', 'worldbuilding-notes.md', 'characters.md', 'lore-chord-stone.md', 'lantern-row-guide.md', 'bookshop.md',
  'party-plan.md', 'The Five Orange Pips.md', 'my-prologue-ideas.md']
for (const n of scenes) assert.equal(chapterLike(n), true, `scene: ${n}`)
for (const n of lore) assert.equal(chapterLike(n), false, `lore: ${n}`)
console.log(`ok  chapterLike: ${scenes.length} chapter-like names, ${lore.length} others`)
// Reading order (shared/utils/bible.ts): books by their first file name, chapters by title with numbers in order.
import { sortReadingOrder } from '../shared/utils/bible.ts'
const books = sortReadingOrder([
  { folder: 'Ozma of Oz', title: 'Ozma of Oz — Chapter 2', filename: '1907-ozma-of-oz-02.md' },
  { folder: 'The Wonderful Wizard of Oz', title: 'The Wonderful Wizard of Oz — Chapter 10', filename: '1900-the-wonderful-wizard-of-oz-10.md' },
  { folder: 'The Marvelous Land of Oz', title: 'The Marvelous Land of Oz — Chapter 1', filename: '1904-the-marvelous-land-of-oz-01.md' },
  { folder: 'The Wonderful Wizard of Oz', title: 'The Wonderful Wizard of Oz — Chapter 2', filename: '1900-the-wonderful-wizard-of-oz-02.md' },
  { folder: 'Ozma of Oz', title: 'Ozma of Oz — Chapter 1', filename: '1907-ozma-of-oz-01.md' },
]).map(d => d.filename)
assert.deepEqual(books, ['1900-the-wonderful-wizard-of-oz-02.md', '1900-the-wonderful-wizard-of-oz-10.md', '1904-the-marvelous-land-of-oz-01.md', '1907-ozma-of-oz-01.md', '1907-ozma-of-oz-02.md'])
console.log('reading order: ok')
