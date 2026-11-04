# The Oz books sample: sources

All texts are by L. Frank Baum (1856–1919). Baum died in 1919, so his works are public domain in the UK and the EU (life + 70
years) since 1 January 1990. All three books were first published before 1931, so they are also public domain in the United
States.

The texts come from Project Gutenberg plain-text ebooks (UTF-8, downloaded 2026-11-03). `scripts/gutenberg-corpus.mjs oz <dir>`
turns them into `docs/`: everything outside the `*** START / END OF THE PROJECT GUTENBERG EBOOK ***` markers (licence, header,
footer, "Project Gutenberg" trademark) is removed, as is everything before each book's first chapter (title page, dedication,
Baum's introduction or author's note, list of chapters), the illustration placeholders (`[Illustration: image016]`, 128 in
The Marvelous Land of Oz) and a closing "The End". Baum's words are unchanged; only the layout is: hard-wrapped lines of a
paragraph are joined with a space (verse keeps its lines), indentation is removed, and each document opens with a
`# Book — Chapter N: Title` heading. One document per chapter. Spelling and punctuation follow each ebook: Ozma of Oz uses
straight quotes, `--` for dashes and two spaces after a full stop, the other two curly quotes and em dashes.

| Book | First published | Gutenberg ebook | Documents |
|---|---|---|---|
| The Wonderful Wizard of Oz | 1900, George M. Hill Co., Chicago and New York | #55 (updated 29 Dec 2024), https://www.gutenberg.org/ebooks/55 | 24 chapters |
| The Marvelous Land of Oz | 1904, Reilly & Britton, Chicago | #54 (updated 27 Apr 2022), https://www.gutenberg.org/ebooks/54 | 24 chapters |
| Ozma of Oz | 1907, Reilly & Britton, Chicago | #486 (updated 8 May 2026), https://www.gutenberg.org/ebooks/486 | 21 chapters |

69 documents, 119,316 words. The Marvelous Land of Oz has no chapter numbers in the ebook; the documents number its chapters
in order.

No gold set: unlike Sherlock Holmes, no list of known slips was checked against these texts, so `/metrics` has nothing to score
for this sample.

## Cover

`cover.jpg` is the cover of "The Wonderful Wizard of Oz, Chapter 1: The Cyclone" (`manifest.json` → `cover`), which the book
exports use as the book cover.

- Image: the front cover of the first edition, the Cowardly Lion under the title.
- Artist: W. W. Denslow (1856–1915), who illustrated the book and designed its cover.
- Published: George M. Hill Co., Chicago and New York, 1900 (copyright 1899).
- Source: Wikimedia Commons, https://commons.wikimedia.org/wiki/File:The_Wonderful_Wizard_of_Oz_-_W.W._Denslow_cover.jpg
  (from the Library of Congress Rare Book and Special Collections; original 2063 × 2558 JPEG, downloaded 2026-11-04).
- Licence: public domain (published in 1900 in the United States; Denslow died in 1915).
- Changes: scaled to 700 px wide, metadata stripped, saved as progressive JPEG (about 115 KB).

`candidates.json` is a recorded extraction (see its `_note`); recorded mode replays it only for these exact texts.
