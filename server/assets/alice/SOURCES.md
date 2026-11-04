# Alice sample: sources

Both texts are by Lewis Carroll (Charles Lutwidge Dodgson, 1832–1898). He died in 1898, so his works are public domain in the
UK and the EU (life + 70 years) and, published in 1865 and 1871, in the United States.

The texts come from Project Gutenberg plain-text ebooks (UTF-8, downloaded 2026-11-03; both the Millennium Fulcrum Edition).
`scripts/gutenberg-corpus.mjs alice <dir>` turns them into `docs/`: everything outside the
`*** START / END OF THE PROJECT GUTENBERG EBOOK ***` markers (licence, header, footer, "Project Gutenberg" trademark) is
removed, as is everything before each book's first chapter (title page, contents; for Through the Looking-Glass also the
dramatis personae, the chess problem with its chessboard and the prefatory poem "Child of the pure unclouded brow") and the
closing "THE END". Carroll's words are unchanged; only the layout is: hard-wrapped lines of a paragraph are joined with a space
(verse, such as "How doth the little crocodile" and "Jabberwocky", keeps its lines), indentation is removed, and each document
opens with a `# Book — Chapter N: Title` heading. One document per chapter. Italics stay as the ebook marks them (`_word_`),
which the reader shows as italics. The closing poem "A boat beneath a sunny sky" stays at the end of Through the
Looking-Glass, Chapter 12, where the book prints it.

| Book | First published | Gutenberg ebook | Documents |
|---|---|---|---|
| Alice's Adventures in Wonderland | 1865, Macmillan, London | #11 (updated 26 Jun 2025), https://www.gutenberg.org/ebooks/11 | 12 chapters |
| Through the Looking-Glass, and What Alice Found There | 1871 (dated 1872), Macmillan, London | #12 (updated 11 Jun 2026), https://www.gutenberg.org/ebooks/12 | 12 chapters |

24 documents, 55,825 words. Through the Looking-Glass chapters 10 ("Shaking") and 11 ("Waking") are two paragraphs and one
sentence long, as in the book.

No gold set: unlike Sherlock Holmes, no list of known slips was checked against these texts, so `/metrics` has nothing to score
for this sample.

## Cover

`cover.jpg` is the cover of "Alice's Adventures in Wonderland, Chapter 1: Down the Rabbit-Hole" (`manifest.json` → `cover`),
which the book exports use as the book cover.

- Illustration: the White Rabbit looking at his watch.
- Artist: John Tenniel (1820–1914).
- Published: Alice's Adventures in Wonderland, Macmillan, 1865.
- Source: Wikimedia Commons, https://commons.wikimedia.org/wiki/File:Alice_par_John_Tenniel_02.png (original 789 × 1207 PNG,
  downloaded 2026-11-04).
- Licence: public domain (published in 1865; Tenniel died in 1914).
- Changes: scaled to 560 px wide, greyscale, metadata stripped, saved as progressive JPEG (about 114 KB).

`candidates.json` is a recorded extraction (see its `_note`); recorded mode replays it only for these exact texts.
