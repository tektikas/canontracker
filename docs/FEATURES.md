# CanonTracker features

Everything below is built and runs today, in a multi-user web app with sign-up, studios, roles and per-project data. Bold words are labels you will see in the app. Planned work is in [ROADMAP.md](../ROADMAP.md), not here.

Four rules hold everywhere: the AI and connected agents only propose, a person decides what becomes canon; every canon fact cites a quote that appears word for word in a stored source; stored source versions are never changed; and with no evidence the answer is `unknown`.

## Accounts, studios and roles

A studio holds a team and its projects. Every project's data is separate.

- Sign up with name, email and password; log in; change your profile and password in **Settings**. No password reset by email yet: the app says to contact your studio owner.
- Onboarding: name a studio, create the first project, pick its medium (prose, game or screen, nothing preselected), then load a sample or start with your own files.
- Four roles per studio: **owner**, **admin**, **editor**, **viewer**. Viewers read everything, ask questions, dictate and post in Ask conversations; editors import, write and decide canon; admins manage the team and load samples; only owners change owners, and a studio always keeps one.
- **Team**: invite by copyable link with a role, an expiry, single use and revocable (no email is sent). Removed members keep their name on past decisions; users are never deleted.
- **Projects**: a searchable list and a page per project (name, medium, art style, default conflict severities, entity types, research profile, load a sample).
- Project switcher and user menu in the shell, light and dark themes, a phone bottom nav, **Ctrl/⌘ K** search and commands, **Ctrl/⌘ J** for Ask, and `?` for help on the page you are on.
- First-run help: a **Getting started** checklist on Home, a guided tour of the demo (it points, never clicks), empty states with one next action, and a public help centre with a page per screen.

## Import and the Library

Bring the files you have. Sources are hashed and versioned; an import never changes earlier text.

- Formats: `.md`, `.txt`, `.fountain` (screenplays), `.yarn` and `.ink` (game dialogue), `.csv`, `.tsv`, `.json` and Word `.docx`. Up to 4 MB of text per file, 20 files per request.
- Drag and drop anywhere on **Library** or Home. Same file name = next version; same text = skipped (line endings and trailing spaces aside). **Upload new version** on a document's page takes a file of any name. Uploading an earlier draft again makes it the newest version.
- **Whole manuscripts**: one file of a book is split at its chapter headings ("Chapter 7", "CHAPTER IV.", "Chapter the First", Part/Book, Prologue/Epilogue, Markdown or Word headings) into one document per chapter, in reading order, in a folder named after the book. Front matter becomes one lore document; a Project Gutenberg header and licence are dropped. Uploading the book again versions only the chapters that changed. **Keep as one document** turns the split off.
- **Word**: headings, bold and italic, lists, tables and footnotes are kept as text; tracked changes are read as accepted; Word comments become notes pinned to the words they were on. The original `.docx` is kept for download.
- **Recordings**: MP3, WAV, M4A, OGG, WebM or FLAC, up to 64 MB and 30 minutes, become a read-only transcript with a time on every passage. A citation shows "at 02:14" and plays that line. Project names are sent as recognition hints.
- **Compare with a script**: link a recording to its script ("NAME: line" or screenplay cues) and see each line kept, changed, added or not said. Changed and added lines that contradict canon, or each other within the take, are flagged by the rule engine.
- Library: folders (two levels), coloured tags, kinds, sort, filters, title search, multi-select move, tag and set kind, rename, and **Archive** (hidden from the Library, reading order and book exports; history and citing canon stay).
- Document kinds: the AI says whether a document is story or reference as it reads it; a kind a person sets is never changed again. Prose projects say **Chapter**, game and screen projects say **Scene**.
- Background reading: an upload answers at once while the AI reads it, with live status in the Library, on the document and in Review ("The AI is reading", "AI critic checking", "Done", or "Didn't finish" with the reason and **Try again**). Three run at a time.
- Reader: Markdown emphasis shown as italics and bold, find (`/` or Ctrl+F), outline, jump to line, version picker. History: every version with who, when and how, and a passage diff listing the canon facts that cite changed or removed passages, with **Propose a change**.

## AI extraction and review

The AI proposes; a person decides. Each candidate carries the quote it came from, checked before anyone sees it.

- Extraction proposes characters, places, relationships, events, travel times and world rules as candidates, each with subject, predicate, object, story time and a quote. It is told the names the project already uses, so chapters read one by one name a person the same way.
- One verbatim check for every path (extraction, Add fact, agents, research, continuity): the quote must be in one passage of the latest version. It matches across smart quotes, dashes, ellipses, line breaks and Markdown emphasis, and stores the source's exact characters. A candidate whose quote is not in the source is blocked and cannot be accepted.
- **Review**: one candidate at a time with its source passage beside it; **Accept**, **Edit & accept** (with From / Until / Roughly for time), **Reject…** with a reason; keyboard J/K/A/E/R. Filter by document or Library folder.
- Duplicates are caught across every status; re-extracting a document adds only new candidates.
- **AI critic**: a second opinion on each verified candidate: keep, reject or needs edit, with a reason (figurative, not stated, ambiguous time or place, duplicate, wrong subject) and one line why. A flag stands only if two more readings with the whole document agree. "Use in Edit & accept" fills in its suggestion for you to check. Advice only: it never changes a fact.
- **Accept N the AI critic keeps…** accepts the kept candidates in one human decision; the opinions it relied on are recorded with the decision.
- Candidates from connected agents are marked **Agent proposal** and go through the same review.

## Canon

Accepted facts form the canon: browsable, searchable and cited.

- **Canon** list: grouped, filtered and paged, one line per fact, each linking to the passage it came from. Superseded facts are kept with their history, never deleted. Preloaded sample canon carries a "Sample canon (preloaded)" badge.
- Relationship graph coloured by entity type, one node per wiki page; opens on the 40 most-named entities with **Show all**.
- Timeline with two axes: **Story time** (`D3 14:00`, day-only `D3`, day 0 and negative days for backstory) and **Reading order** (each fact in the chapter that tells it), so novels without clock times still get one.
- **Add fact** from selected words: sentence first; who, does what, where and when are read from the sentence and stay editable; pick the entity type for a new name. Goes to canon (you decide) or to Review.
- Version re-check: when a source gets a new version, each citation is unchanged, **Evidence outdated** (quote gone or repeated) or kept by a person. One bulk **Confirm** re-pins the unchanged citations; Home, Library and upload results link to the list.

## Entity wiki

A page for every character, place, item, faction and event, filed from canon automatically.

- Pages are filed for name-shaped subjects and objects in accepted canon; each page takes the type the AI gave the name most often. Tabs **Story**, **Timeline**, **Relationships**, **Appearances**, **Notes**.
- Entity types are per project: game projects start with NPC, item, ability and quest. Rename, recolour, re-icon, add, or remove a type by naming the type its pages become.
- Summary, aliases, medium fields, notes and portraits (uploaded or AI-generated) are editorial, labelled as such, and never used by conflicts or impact.
- **Possibly the same**: suggests pages of one type where one name is part of the other ("Sherlock" and "Sherlock Holmes").
- Merge is a human identity decision with a preview: facts move to the kept page, old names become aliases, rule-based conflicts that depended on the split close as resolved by merge, change proposals whose impact moved must be re-analysed, and a later candidate using a merged name is saved under the kept name. The audit log keeps the full old page.
- Mentions: known names and aliases in any text link to their page, with a hover or tap card.

## Conflicts

**Scan canon** runs narrow checks over accepted canon. Each hit is a candidate for a person to judge, never an edit to canon.

- **Same person, two places, exact times overlap** (hard by default).
- **Same person, two places, approximate times overlap**: at least one time is marked roughly (soft by default).
- **Not enough time to travel**: canon gives a trip's duration and a character makes it faster; trips near the limit are soft.
- **Relationship used after it ended**.
- **Acts after death**: a character does something after canon says they died; burials, mourning and memories don't count.
- **Same detail, two answers**: one subject, two answers for a single-valued detail at the same time (a wound in the shoulder and in the leg). "Left shoulder" agrees with "shoulder".
- **Fact breaks a world rule**: the AI reads each world rule against the canon it touches and suggests violations, labelled as AI-suggested and soft by default.
- Both facts and both sources side by side; decide **Confirm conflict**, **False alarm** or **Uncertain** with a reason. Hard and soft severity, with per-project defaults per rule.

## Change impact

See what a change touches before it happens.

- **Propose a change** to a canon fact (on **Changes**, from Home, or from a version diff). Impact stays inside accepted canon, at most two hops, and every item carries its path, evidence and rationale. Empty reads "no impact found", not "no impact".
- Impact lists every document citing what it touches, grouped by kind (scenes, lore, quests, episodes, recordings).
- **Accept & apply** writes the new wording and keeps the old fact as superseded, and opens a re-review task per affected document; **Reject** leaves canon alone; **Revert this change…** restores the original wording as a new version.
- Export the impact manifest as JSON, CSV or Markdown. **Tasks** tracks the re-reviews.

## Writing and notes

Write in the app without leaving the canon behind.

- **Write** (New document on Home): write or paste; drafts autosave privately (only the author can see them); **Save to story** imports them like an upload. Focus mode.
- Edit any written or uploaded document: the save is a new version and affected citations are flagged. Recording transcripts are never edited.
- Select words in the reader for **Add fact** (F), **Add entity** (E), **Add note** (N), **Research this** (R) and **Check continuity** (C).
- **Notes**: open → ready → done, pinned to a passage, shown in the reader margin, on entity pages and on **Notes**.
- Dictation into the editor and the Ask box (nothing stored but the text you keep).

## Ask, Research and Continuity

Questions about the canon, about the real world, and about a draft.

- **Ask**: team conversations every member can read and post in, viewers included. **Canon** mode answers from accepted canon only, with the facts and quotes used; no evidence = `unknown`. A vague "she" gets a follow-up question, not a guess. Attach a document, passage, entity or conflict as context. Also a drawer on every page.
- **Research**: real-world questions (history, science, travel, crime) answered by a bounded agent with web search and deterministic calculators (physics, calendars, the sky, period travel, time since death). Every cited page is fetched and its quote checked; a verdict is "established" only when every claim has a verified source or a calculation. Results are research notes labelled "not canon"; **Promote** one and it waits in Review like any candidate. A per-project research profile (field, period, place, legal system) goes into every question.
- **Check continuity**: a draft, a selection or an Ask message is checked against canon by an agent that uses CanonTracker's own read tools. Each finding must quote your text and cite real canon facts, or it is dropped and listed as dropped; rule-engine hits are shown as "rule engine, not AI". Kinds: contradicts, depends on, new. Fixes are suggestions, never applied; a new finding can be sent to Review.

## Export, share and books

Hand the canon to people who don't use the app. Accepted canon only, each fact with its citations.

- Story bible as Markdown (or a .zip with portraits), print view for "Save as PDF", and EPUB 3 with real footnotes.
- Book layouts: the bible as a book (cover, contents, a chapter per entity kind, numbered source notes) and the manuscript (latest documents in reading order).
- Scope: whole project, selected entities or one folder. Wiki text is opt-in and labelled "not canon"; open conflicts are listed as not canon unless left out.
- Read-only share links: one project, optional 7 or 30 day expiry, turn off any time, open count. Only a hash is stored; shared pages never show user names, notes, candidates or the audit log.

## Agents and MCP

Connect any MCP client (Claude Code, Cursor, Muse Code and others) to the same canon, permissions and audit as the web app.

- `/mcp` over Streamable HTTP, a per-user token from **Settings → Agents & API** (shown once, one project, revocable, last used shown). Ready-made config snippets per client, plus a small bridge script for function-calling APIs.
- 37 tools: 16 canon and document tools (context pack, search facts, entity, timeline, ask, read document, check facts as a dry run, conflicts, impact, re-check, tasks, propose candidate) and 21 area tools (review queue, changes, conflict scan, entities, documents, drafts, notes, library, images, research, continuity, conversations, export, share links, audit, metrics, agent runs, search, project settings, team list).
- Token levels: **propose** (reads, checks, model runs and proposals) or **full** (also the editorial edits your live role allows, shown as "via agent").
- Canon decisions are human-only at every level: accept, edit & accept, reject, add a fact straight to canon, decide or revert a change, decide a conflict, confirm a re-check and merge entities are refused before any tool runs, and each decision route refuses an agent call itself.
- A proposed quote must be verbatim in the latest version or it is refused and the refusal is audited. Every tool has a JSON schema with limits; big results page with cursors; 120 calls a minute per token.

## Audit, metrics and agent activity

Every decision and every AI run can be traced.

- **Audit log**: append-only, with who, when and, for agent requests, which token. Exportable as JSON or Markdown. A sample reload keeps the trail and marks events whose targets it removed.
- **Agent activity**: every AI run newest first, with its agent, model, prompt version, effort, each step (tool, arguments, result, latency, tokens) and what people did with the output. "How was this made?" links lead there from answers and reports.
- **Metrics**: scores the gold set of the loaded sample (Broken Tide, The Ashbell Pass or Sherlock Holmes) against targets: citations, figurative and hallucinated candidates caught, `unknown` answers, conflict recall, alert precision, impact recall and precision. With run history and the model-call trace.

## Security and limits

Isolation is enforced in one place; limits are counted as data arrives.

- One middleware guards every content route, resolves the current project, checks membership and blocks viewer writes; every content query filters on the project. Other studios' projects answer 404.
- Sessions in a sealed httpOnly cookie; passwords hashed with scrypt; API and share tokens stored as SHA-256 only.
- Throttles: failed log-ins (10 per 5 min per email, 30 per IP), sign-ups and demo accounts per IP, Ask (30 a minute), search, Research (6 per person, 20 per project per 10 min), Continuity (10 / 40 per 10 min), MCP (120 calls a minute per token), audio (10 min dictation and 45 min recordings per person, 90 min per project, per hour).
- Size caps counted while the body streams, chunked requests included: JSON 10 MB, MCP 256 KB per request (10 MB for document, draft, entity and image tools), text 4 MB per file, recordings 64 MB.
- Word files: macros, encrypted and old `.doc` files are refused; zip guards (2,000 entries, 64 MB declared, 8 MB per part and 16 MB in total as actually inflated, so a lying zip bomb stops), CRC and header checks, and no DOCTYPE or custom entities.
- Research pages and generated-image downloads go through one safe fetcher (HTTPS, public addresses only, size and time limits); only `https:` links without credentials are shown.
- The model key stays on the server. Live AI failures are shown and recorded, never filled in with recorded output.

## Samples and the demo

Six samples, each loadable into any project by an admin from **Settings → Projects**.

- **Try the demo** (on the landing, log-in and sign-up pages): one click makes a guest account with a demo studio and three projects, Broken Tide, The Ashbell Pass and Sherlock Holmes. Most canon is preloaded as labelled sample canon, the conflict scan has run, a rule change waits with its impact, and a short review queue is left to decide.
- **Broken Tide**: an original island story, 13 documents, with a figurative "sister", a hallucinated quote, planted conflicts and a rule change; the guided tour runs on it.
- **Lantern Row**: three short documents with five preloaded sample canon facts and one planted timing conflict.
- **The Ashbell Pass**: a game story, 28 documents (about 22.5k words) in folders, with NPCs, quests, a recorded voice take, merge beats and a rule change.
- **Sherlock Holmes**: 31 chapters and stories (about 127k words, public domain) with the slips Sherlockians know as a gold set.
- **The Oz books** (69 chapters, about 119k words) and **Alice** (24 chapters, about 56k words): public-domain classics with wiki pages for the cast.
- Without an API key the app replays recorded AI output for the samples' exact text; with a key it calls the model live.

## Quality gates

`pnpm check` runs everything serially and exits nonzero on any failure. See [checks.md](checks.md).

- Typecheck and production build.
- Every offline self-check (`scripts/*-check.*`): quote matching, story time, manuscript split, entity names, detail answers, death rule, script alignment, calculators, continuity grounding and more.
- Every HTTP probe against a fresh production server and database per suite: API hardening (no 5xx on bad bodies, viewer writes 403, signed out 401, other studio 404, size caps, throttles), roles and isolation, all six samples and the guest demo, review, re-check, merge, library, Word, voice, sharing, EPUB, MCP (every decision refused for every token level), help pages and more.
- Seeded merge fuzzing with database invariants after every step, schema migration probes, image-fetch safety, and replay of recorded real Meta API responses through the production app.
- No live key and no local data are used; recorded and stubbed checks are not live verification. Browser QA runs separately at desktop and mobile sizes.
