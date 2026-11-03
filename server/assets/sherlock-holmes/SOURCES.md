# Sherlock Holmes sample: sources

All texts are by Arthur Conan Doyle (1859–1930). Doyle died in 1930, so his works are public domain in the UK and the EU
(life + 70 years) since 1 January 2001. Every work below was first published before 1927, so it is also public domain in
the United States.

The texts come from Project Gutenberg plain-text ebooks (UTF-8, downloaded 2026-11-03). `scripts/sherlock-corpus.mjs`
turns them into `docs/`: everything outside the `*** START / END OF THE PROJECT GUTENBERG EBOOK ***` markers (licence,
header, footer, "Project Gutenberg" trademark) is removed, as are each book's title page and contents. Doyle's words are
unchanged; only the layout is: hard-wrapped lines of a paragraph are joined with a space, indentation is removed, and each
document opens with a `# Work — Chapter` heading. One document per chapter (novels) or per story.

| Work | First published | Gutenberg ebook | Documents |
|---|---|---|---|
| A Study in Scarlet | 1887, Beeton's Christmas Annual | #244, https://www.gutenberg.org/ebooks/244 | 14 (Part I and II, 7 chapters each) |
| The Sign of the Four | 1890, Lippincott's Monthly Magazine | #2097, https://www.gutenberg.org/ebooks/2097 | 12 chapters |
| A Scandal in Bohemia | 1891, The Strand Magazine | #1661 (The Adventures of Sherlock Holmes), https://www.gutenberg.org/ebooks/1661 | 1 |
| The Five Orange Pips | 1891, The Strand Magazine | #1661 | 1 |
| The Man with the Twisted Lip | 1891, The Strand Magazine | #1661 | 1 |
| The Adventure of the Noble Bachelor | 1892, The Strand Magazine | #1661 | 1 |
| The Greek Interpreter | 1893, The Strand Magazine | #834 (The Memoirs of Sherlock Holmes), https://www.gutenberg.org/ebooks/834 | 1 |

31 documents, 126,658 words.

## Why these works

They hold the best-known slips in the early canon, which readers have argued about for more than a century. Each
contradiction in `gold.json` was checked by reading these texts; the quotes there are copied from `docs/`. No external
list of "canonical cruxes" was fetched for this sample: the selection follows the slips commonly cited by Sherlockians
(Watson's wound, his wife calling him "James", which Dorothy L. Sayers took up in her essay "Dr. Watson's Christian
Name", the landlady "Mrs. Turner", Watson's marriage dates), and only what the text itself states is in the gold set.

- Watson's Jezail wound: the shoulder (A Study in Scarlet, I.1), his left arm (I.2), the leg (The Sign of the Four, 1 and 2),
  "one of my limbs" (The Noble Bachelor).
- Watson's first name: "JOHN H. WATSON" (A Study in Scarlet, I.1); his wife calls him "James" (The Man with the Twisted Lip).
- Holmes's landlady: Mrs. Hudson (The Sign of the Four, 8); "Mrs. Turner" brings the tray and "our landlady" provides
  the meal (A Scandal in Bohemia).
- Mary Morstan's mother: dead (The Sign of the Four, 2); in 1887 Watson's wife is "on a visit to her mother's" (The Five
  Orange Pips), before Watson has met Mary (The Sign of the Four is set six years after 1882). Holds only if that wife is
  Mary; Sherlockians use it to argue for an earlier wife.
- Known but not detected by a deterministic rule (no comparable story times or values): Watson's marriage dates (a wife in
  "the year ’87" in The Five Orange Pips, but he meets Mary in The Sign of the Four and is still at Baker Street "a few
  weeks before my own marriage" in The Noble Bachelor); "Astronomy.—Nil" (A Study
  in Scarlet, I.2) against Holmes chatting about "the obliquity of the ecliptic" (The Greek Interpreter); Watson's belief
  that Holmes was "an orphan with no relatives living" before Mycroft (The Greek Interpreter; the text explains it itself).

## Cover

`cover.jpg` is the cover of "A Scandal in Bohemia" (`manifest.json` → `cover`), which the book exports use as the book cover.

- Illustration: "Then he stood before the fire.", Watson seated and Holmes standing at the fireplace in Baker Street.
- Artist: Sidney Paget (1860–1908).
- Published: The Strand Magazine, vol. 2, July 1891, page 62, with "A Scandal in Bohemia".
- Source: Wikimedia Commons, https://commons.wikimedia.org/wiki/File:Strand2-062-ThenHeStoodBeforeTheFire.jpg
  (original 1104 × 1593 JPEG, downloaded 2026-11-03).
- Licence: public domain. Paget died in 1908, so the work is public domain wherever the term is the author's life plus
  100 years or less, and it was published before 1931, so it is public domain in the United States (Commons: "Public domain",
  not copyrighted).
- Changes: scaled to 900 px wide, converted to greyscale, metadata stripped, saved as progressive JPEG (about 255 KB).

`candidates.json` is a recorded extraction (see its `_note`); recorded mode replays it only for these exact texts.
