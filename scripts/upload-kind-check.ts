// Self-check for referenceLike (shared/utils/upload.ts): the kind a file gets from its name before the AI has read it
// (reference = 'lore' only when the name says so, story text = 'scene' otherwise). Run: node scripts/upload-kind-check.ts
import assert from 'node:assert/strict'
import { referenceLike } from '../shared/utils/upload.ts'

const story = ['chapter-01.md', 'Chapter 3 - The Bell.docx', 'ch02.md', 'Part II.md', 'prologue.md', '01 The Arrival.md', 'S03-the-chord-stone.md',
  'notebook.md', 'book.md', 'The Five Orange Pips.md', 'Dracula.txt', 'pg345.txt', 'my-prologue-ideas.md', 'bookshop.md', 'party-plan.md', 'lantern-row-guide.md']
const reference = ['lore-chord-stone.md', 'worldbuilding-notes.md', 'World Building.md', 'characters.md', 'Character.md', 'CharacterNotes.md', 'story-bible.docx',
  'book-notes.md', 'outline.md', 'Season 2 Outlines.md', 'glossary.txt', 'wiki_export.md', 'README.md', 'Notes.md', 'chapters_outline.md']
for (const n of story) assert.equal(referenceLike(n), false, `story: ${n}`)
for (const n of reference) assert.equal(referenceLike(n), true, `reference: ${n}`)
console.log(`ok  referenceLike: ${story.length} story names, ${reference.length} reference names`)
// Reading order (shared/utils/bible.ts): books by their first file name, chapters by title with numbers in order; a manuscript
// split on upload ("<book>-ch-007.md") keeps the file order, so "Chapter Two" stays after "Chapter One" and the front matter first.
import { sortReadingOrder } from '../shared/utils/bible.ts'
const books = sortReadingOrder([
  { folder: 'Ozma of Oz', title: 'Ozma of Oz — Chapter 2', filename: '1907-ozma-of-oz-02.md' },
  { folder: 'The Wonderful Wizard of Oz', title: 'The Wonderful Wizard of Oz — Chapter 10', filename: '1900-the-wonderful-wizard-of-oz-10.md' },
  { folder: 'The Marvelous Land of Oz', title: 'The Marvelous Land of Oz — Chapter 1', filename: '1904-the-marvelous-land-of-oz-01.md' },
  { folder: 'The Wonderful Wizard of Oz', title: 'The Wonderful Wizard of Oz — Chapter 2', filename: '1900-the-wonderful-wizard-of-oz-02.md' },
  { folder: 'Ozma of Oz', title: 'Ozma of Oz — Chapter 1', filename: '1907-ozma-of-oz-01.md' },
]).map(d => d.filename)
assert.deepEqual(books, ['1900-the-wonderful-wizard-of-oz-02.md', '1900-the-wonderful-wizard-of-oz-10.md', '1904-the-marvelous-land-of-oz-01.md', '1907-ozma-of-oz-01.md', '1907-ozma-of-oz-02.md'])
const split = sortReadingOrder([
  { folder: 'The Bell', title: 'The Bell — Prologue', filename: 'the-bell-ch-001.md' },
  { folder: 'The Bell', title: 'The Bell — Chapter Two', filename: 'the-bell-ch-003.md' },
  { folder: 'The Bell', title: 'The Bell — Front matter', filename: 'the-bell-ch-000.md' },
  { folder: 'The Bell', title: 'The Bell — Chapter One', filename: 'the-bell-ch-002.md' },
  { folder: 'The Bell', title: 'The Bell — Epilogue', key: 'The Bell/the-bell-ch-004.md' },
]).map(d => d.title)
assert.deepEqual(split, ['The Bell — Front matter', 'The Bell — Prologue', 'The Bell — Chapter One', 'The Bell — Chapter Two', 'The Bell — Epilogue'])
console.log('reading order: ok')
