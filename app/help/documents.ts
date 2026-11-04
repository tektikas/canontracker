import type { HelpPage } from './types'

export default [
  {
    slug: 'getting-started',
    group: 'start',
    title: 'Getting started',
    summary: 'Create an account, set up your studio and first project, then try a sample story or bring your own lore.',
    where: 'Sign up from the public site, or open an invite link from a teammate.',
    sections: [
      {
        title: 'Create your account',
        text: 'Use **Create an account** on the log-in page. Fill in **Your name**, **Work email** and **Password** (at least 8 characters), then press **Create account**. Your name is shown next to every decision you make.',
      },
      {
        title: 'Joining a team instead',
        text: 'If a teammate sent you an invite link, open it. The page names the studio, who invited you and **Your role**. Log in or create an account, then join. Invite links work once and expire; if one has expired or was used, ask for a new link. Password reset by email isn’t available yet: contact your studio owner.',
      },
      {
        title: 'Set up your studio and first project',
        text: 'A new account walks through three steps: **Studio**, **First project** and **Get started**.',
        points: [
          '**Name your studio**: your team’s shared space. Type a **Studio name** and press **Continue**. You become its owner.',
          '**What are you writing?**: a project holds one story world’s lore, scenes and canon. Type a **Story or project name**, pick its **Medium** (novel or prose, film or series, or game) and press **Create project**.',
          '**How do you want to start?**: pick a sample story or your own files (see below).',
        ],
      },
      {
        title: 'Start from a sample or your own story',
        points: [
          '**Try the Broken Tide demo**: press **Load demo and take the tour**. It adds Broken Tide, an island story with planted contradictions, and Lantern Row, a three-page sample with five preloaded canon facts, each in its own project. Your first project doesn’t change.',
          '**Load The Ashbell Pass**: a bigger mountain-town game story with NPC schedules, quests and items, in its own project.',
          '**Load Sherlock Holmes**: two novels and five stories by Arthur Conan Doyle (public domain), in its own project.',
          '**Load the Oz books** and **Load Alice**: L. Frank Baum’s first three Oz books and Lewis Carroll’s two Alice books (public domain), one source per chapter, each in its own project.',
          '**Bring your own story**: opens your project’s Home, where you import Markdown, text or Word (.docx) files, or write a document in the app.',
          '**Skip for now**: you can load a sample, import files or write a document any time from Home.',
        ],
      },
      {
        title: 'Load a sample later',
        points: [
          'On Home, **Load demo set** replaces everything in the open project with Broken Tide. The audit trail keeps its history; other projects aren’t touched.',
          'In Studio settings → **Projects**, **New project** has a **Start with** list: an empty project or any sample. Press **Create and open**.',
          'On a project’s own page, **Danger zone** lists every sample with **Replace with this**. It replaces everything in that project, so it always asks first.',
          'Samples come in their own projects; switch between them from **Switch project** at the top of the sidebar.',
        ],
      },
      {
        title: 'Try the demo without an account',
        text: 'On the home page, the log-in page or the sign-up page, press **Try the demo**. You get a demo account with three projects (Broken Tide, The Ashbell Pass and Sherlock Holmes), and Broken Tide opens with the guided tour. Most of each story’s canon is already in place, marked **Sample canon (preloaded)**: nobody decided it, so it never counts as a person’s decision. A short queue is left in Review for you, including the traps (a figure of speech, a made-up quote), the conflict scan has already run, and Broken Tide and The Ashbell Pass each have a rule change waiting for your decision. The demo account isn’t tied to an email: use **sign up** in the banner to make your own account.',
      },
      {
        title: 'The guided tour',
        text: 'A short tour of the Broken Tide demo. The core comes first, five steps: a figurative candidate, a made-up quote, accepting what holds up, a caught conflict and a change’s impact. Then choose **Keep going: wiki, timeline, Ask, agents** for six more short stops (a character’s page, the timeline, Ask, the reader, export and agents), or **Explore on my own**. **Back**, **Next** and **Skip tour** are on every card, and `Esc` ends it. It opens after **Load demo and take the tour** or **Try the demo**; start it again from **Take the tour** in the Getting started checklist on Home. It only points at the screen and moves on when you act; it never clicks or decides for you.',
      },
      {
        title: 'The Getting started checklist',
        text: 'Editors, admins and owners see **Getting started** on Home. Each step ticks itself off when it’s done in the project, for anyone on the team: add a document, review a candidate, see your canon, run a conflict scan, propose a change, invite a teammate (admins and owners) and, optionally, connect an agent. **Hide** puts it away for you in this project; **Show getting started** brings it back.',
      },
      {
        title: 'Invited to a studio with no projects?',
        text: 'You’ll see **No projects yet**. Ask a studio owner or admin to create one, then press **Check again**.',
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Join by invite and read every project in the studio. Doesn’t see the Getting started checklist.' },
      { role: 'Editor', can: 'Sees the checklist. Imports and writes documents.' },
      { role: 'Admin, owner', can: 'Create projects, start them from a sample, load or replace a sample in a project, and invite teammates.' },
    ],
    related: ['home', 'library', 'candidates-and-canon', 'roles', 'projects', 'team'],
    keywords: ['sign up', 'onboarding', 'studio', 'first project', 'demo', 'try the demo', 'guest', 'sample', 'tour', 'checklist', 'invite', 'Broken Tide', 'Lantern Row', 'Ashbell Pass', 'Sherlock Holmes', 'Oz', 'Alice'],
  },
  {
    slug: 'home',
    group: 'documents',
    title: 'Home',
    summary: 'Your project at a glance: the workflow from import to change impact, the next step to take, your drafts and the latest documents.',
    where: 'Sidebar → **Home**',
    shot: { name: 'home', alt: 'The Home page of a project: the workflow rail with the next step, the Getting started checklist and the latest documents.' },
    see: [
      { label: 'Overview', text: 'How many sources the project has, and a reminder that canon holds only facts a person accepted, each tied to its exact passage.' },
      { label: 'Getting started', text: 'A checklist for editors that ticks itself off as the project fills up. See [Getting started](/help/getting-started).' },
      { label: 'Workflow', text: 'Six steps in order: **Import**, **Review**, **Canon**, **Conflicts**, **Changes**, **Metrics**, each with its count. Under them, **Next step** names the first one that isn’t done, with a button that takes you there.' },
      { label: 'Uploads and Your drafts', text: 'Files you just dropped, with their results, and the drafts only you can see. A draft isn’t part of the story until you save it.' },
      { label: 'Library', text: 'Document and version counts, what is waiting in Review, canon that **Needs re-check** after a source changed, and the six most recently changed documents.' },
      { label: 'Add sources', text: 'Editors get three ways in: the Broken Tide demo (admins and owners), **Write it here** and **Your files**.' },
    ],
    tasks: [
      {
        title: 'Add your first sources',
        steps: [
          'Press **Import files** and pick Markdown, text or Word (.docx) files, or drop them anywhere on Home.',
          'Watch each file under **Uploads**: it is stored read-only and the AI proposes candidate facts.',
          'Press the review button in **Uploads** to decide on the candidates in Review.',
          'Or press **Write a document** to write or paste a scene in the app. Once the project has sources, the same button is **New document** under **Add sources**.',
        ],
      },
      {
        title: 'Search the project',
        steps: [
          'Press **Search** in the sidebar, or `Ctrl K` (`⌘K` on Mac).',
          'Type a name, a word from a scene or a fact: results come from canon facts, entities (any alias too), documents and notes.',
          'Move with the arrow keys and press `Enter` to open a result; a document result opens at the matching passage.',
          'Type a command instead, such as **New document**, **Scan conflicts**, **Propose change** or **Toggle theme**.',
        ],
      },
      {
        title: 'Pick up where you left off',
        steps: [
          'Read **Next step** in the workflow and press its button.',
          'Open a draft from **Your drafts** to keep writing.',
          'Open a recent document from **Library**, or press **Open the library** for all of them.',
        ],
      },
    ],
    sections: [
      {
        title: 'Search',
        text: 'Search covers accepted canon, entities, documents and notes in the open project. With nothing typed it shows your **Recent** results and the **Commands**. Viewers only get the commands that read. See [Keyboard shortcuts](/help/shortcuts).',
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Sees the workflow, the next step and the library summary, and can search.' },
      { role: 'Editor', can: 'Also sees Getting started, imports files and writes documents.' },
      { role: 'Admin, owner', can: 'Also loads the Broken Tide demo set into the project, which replaces everything in it.' },
    ],
    related: ['getting-started', 'library', 'write', 'review', 'shortcuts'],
    keywords: ['overview', 'dashboard', 'next step', 'workflow', 'search', 'command palette', 'drafts', 'import'],
  },
  {
    slug: 'library',
    group: 'documents',
    title: 'Library',
    summary: 'Every source document at its latest version: upload, organise into folders and tags, and see which canon cites each one.',
    where: 'Sidebar → **Library**',
    shot: { name: 'library', alt: 'The Library in The Ashbell Pass sample: folders and tags on the left, the document table with folder, last change, citations and re-check counts on the right.' },
    see: [
      { label: 'Header', text: 'Document and version counts, a link to canon with outdated evidence when there is any, and **Write a document** and **Upload files** for editors.' },
      { label: 'Folders', text: '**All documents**, **Library root** and your folders, two levels deep, each with its count.' },
      { label: 'Tags', text: 'Coloured labels that cut across folders. Click one to show only its documents.' },
      { label: 'Toolbar', text: 'Search titles and file names, filter by kind (**All kinds**), **To re-check only**, and **Archived** once a document is archived.' },
      { label: 'Table', text: '**Title** with the kind icon, file name and tags; **Folder**; **Last change** (version, date and who); **Cited** (canon facts citing it); **Re-check** (canon citing an older version). Click a column to sort; titles sort with their numbers in order (Episode 2 before Episode 10).' },
    ],
    tasks: [
      {
        title: 'Upload documents',
        steps: [
          'Press **Upload files**, or drop files anywhere on the Library.',
          'Pick Markdown, text, Fountain (.fountain), Yarn (.yarn), ink (.ink), CSV, TSV, JSON or Word (.docx) files up to 4 MB, or audio recordings up to 30 minutes. A file with no blank lines (a barks list, a CSV) becomes one passage per line.',
          'Open a folder first to upload straight into it.',
          'Follow each file under **Uploads**: a new file is added, a changed file with the same name becomes its next version, and a file that reads the same as that document’s latest version is skipped (line endings and spaces at line ends don’t count). Going back to an earlier draft’s text makes a new version.',
          'A whole book can go in as one file: it is split into one document per chapter in a folder named after the book, and its row shows how many chapters the AI has read so far. Tick **Keep as one document** to import it unsplit.',
          'The AI then reads each new version in the background. Its row (and its line in the table) says “Waiting”, “The AI is reading” with a timer, “AI critic checking”, then how many facts it found. You can keep working or leave the page meanwhile.',
          'Open Review to decide on the candidates the AI proposed. If a run didn’t finish, the row says why; press Try again.',
        ],
      },
      {
        title: 'Organise with folders and tags',
        steps: [
          'Press **New folder** (the plus next to **Folders**) and type a name; use a folder’s menu for **New subfolder**, **Rename** or **Delete folder**.',
          'Press **New tag** (the plus next to **Tags**), name it, pick a colour and press **Add tag**.',
          'Tick documents in the table, then use **Move to**, **Tag** or **Kind** in the bar that appears.',
          'Use a row’s menu to **Open** it, see its **History**, **Edit text** or **Rename** it.',
        ],
      },
      {
        title: 'Archive old documents',
        steps: [
          'Tick documents and press **Archive**, or use **Archive** in a row’s menu or on the document’s page.',
          'Archived documents leave the Library list, reading order and book exports. Nothing is deleted: canon citing them stays canon and keeps its citations.',
          'Tick **Archived** to see them; press **Unarchive** to bring them back. Uploading a new version of one brings it back too.',
        ],
      },
      {
        title: 'Find what needs a re-check',
        steps: [
          'Tick **To re-check only**, or sort by **Re-check**.',
          'Click a document’s re-check count to open its history and see what changed.',
          'Or follow the header link to every canon fact with outdated evidence.',
        ],
      },
    ],
    sections: [
      {
        title: 'What happens to an upload',
        points: [
          'Sources are stored exactly as uploaded and never edited. Folders, tags, kind and title are labels on top: changing them never touches the text.',
          'A whole book in one file (a manuscript, a Project Gutenberg text, a Word file with heading styles) is split at its chapter headings: “Chapter 7”, “CHAPTER IV.”, “Chapter One”, Prologue, Epilogue, Part headings, Markdown or Word headings, or numbered headings. A table of contents is not mistaken for chapters. Everything before the first chapter (title page, dedication, contents) becomes one “Front matter” document. A long text with no headings at all is cut at paragraph breaks into parts of about 5,000 words. Only a Project Gutenberg header and licence are left out; the chapters’ words are kept exactly.',
          'Uploading the same book again matches each chapter by its place in the book: an unchanged chapter is skipped, an edited one gets a new version (canon citing it is flagged to re-check), and new chapters at the end are added. A chapter inserted in the middle moves every chapter after it up one place, so each of those gets a new version. Word comments go to the chapter they are in; the .docx of a split book is not kept.',
          'Kind: **Chapter** (a novel) or **Scene** (a game or screen project) is the story’s own text. Impact lists every document a change touches, grouped by kind. The AI decides it when it reads a document (story text or reference such as lore, notes or an outline). Until then, a file whose name says lore, notes, characters, bible, outline, worldbuilding, glossary, wiki or readme is **Lore** and everything else story text. A kind set in the Library is never changed by the AI.',
          'A Word file is converted to text once: headings, lists, tables and footnotes are kept, tracked changes are taken as accepted, images are dropped. Word comments become notes on the commented passage. The .docx itself stays available from the reader.',
          'Macro-enabled, encrypted or old .doc Word files are refused.',
          'Audio (MP3, WAV, M4A, OGG, WebM, FLAC) is transcribed by AI into a read-only transcript with timed passages. Recordings count towards an hourly audio limit per person and per project.',
          'After import, the AI proposes candidate facts with a quote. Nothing becomes canon until a person accepts it in [Review](/help/review).',
          'An upload only stores the file, so it is done in a moment; the AI reads it afterwards, up to three documents at a time, and new candidates appear in Review as each one finishes. A run cut off by a server restart shows as not finished, with Try again.',
        ],
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Browse, search, filter and sort, and open any document.' },
      { role: 'Editor, admin, owner', can: 'Upload files and recordings, write documents, archive and unarchive, and manage folders, tags, kinds and titles.' },
    ],
    related: ['reader', 'history', 'write', 'script-vs-recording', 'review', 'versions-and-recheck'],
    keywords: ['upload', 'import', 'docx', 'word', 'markdown', 'audio', 'recording', 'folder', 'tag', 'kind', 'rename', 'sources', 'manuscript', 'book', 'chapters', 'split'],
  },
  {
    slug: 'reader',
    group: 'documents',
    title: 'Reader',
    summary: 'Read a source document with line numbers, find words, and turn selected words into facts, entities, notes, research or a continuity check.',
    where: 'Library → click a document title',
    shot: { name: 'reader', alt: 'A lore document open in the reader: line-numbered passages on the left, the Facts tab with canon facts and their lines on the right.' },
    see: [
      { label: 'Header', text: 'Kind, version (a version picker when there are several), tags, a badge such as **Read-only source**, **Saved version** or **Read-only transcript**, and the text’s sha256. Buttons: **History**, and for editors **Re-extract**, **Edit**, **Upload new version** and **Archive**; **Original Word file** for a converted .docx.' },
      { label: 'Cover', text: 'An optional picture for the document. Editors can **Upload cover** or **Generate cover**.' },
      { label: 'Reader tools', text: '**Find** (`/` or `Ctrl F`), **Outline** to jump to a heading, and **Line** with **Go** to jump to a line number.' },
      { label: 'Text', text: 'One passage per paragraph, with its line numbers. Known names are underlined: hover or tap one for a short card. A note marker in the margin opens that passage’s notes.' },
      { label: 'Side panel', text: '**Facts** (canon and pending candidates citing this document, with their line), **Notes**, **Images** and **Ask** (a chat about this document).' },
    ],
    tasks: [
      {
        title: 'Add a fact from the text',
        steps: [
          'Select the words that say it, within one paragraph.',
          'Press **Add fact** in the bar that appears, or `F`.',
          'Under **What does this passage establish?**, edit the sentence until it says one plain thing.',
          'Open **Who, where and when** to check **Who or what**, **Does what / is what**, the place, and **From**, **Until** or **Roughly** under **When in the story**.',
          'Pick the **Subject type** (and the **Object type** when the fact names someone or somewhere) from your project’s entity types, so a new name gets a wiki page of that type instead of **Other**. It starts as the type of the name’s page, if it has one.',
          'Press **Add to canon** if you’re sure (your name goes on it as the one who decided), or **Send to review** to let a teammate decide.',
        ],
      },
      {
        title: 'Add an entity or a note',
        steps: [
          'Select a name and press **Add entity** (`E`); pick its **Type** and press **Create page**, or **Open page** if it already has one.',
          'Select words and press **Add note** (`N`), write the **Note** and press **Add note** to pin it to that passage.',
          'Notes are for the team and never become canon; they show in the margin and in the **Notes** tab.',
        ],
      },
      {
        title: 'Research or check selected words',
        steps: [
          'Select words in the text.',
          'Press **Research this** (`R`) to ask Research about them in Ask, with the quote attached; outside answers never become canon.',
          'Press **Check continuity** (`C`) to check them against accepted canon; the report opens in Ask with sources and suggested fixes, never applied.',
        ],
      },
      {
        title: 'Re-extract or edit a document',
        steps: [
          'Press **Re-extract** to ask the AI for candidates again; only new ones go to Review, anything already in the project is skipped.',
          'Press **Edit** to change the text; saving makes the next version and the old one stays as it was.',
          'Press **Upload new version** to pick a file (any name, such as a revision called “Ep101_Blue”) and store it as this document’s next version; the AI reads it in the background.',
          'Press **History** to see every version and what changed between them.',
        ],
      },
    ],
    sections: [
      {
        title: 'Good to know',
        points: [
          'The quote of a new fact must appear word for word in the passage. Smart quotes, dashes and line breaks are matched loosely, but the passage’s exact words are stored.',
          'New facts and notes always go on the latest version. On an older version you can only read, research and check continuity, with a link to the latest.',
          'A recording’s transcript shows a player and a play button with the time of each passage. **Script vs recording** (or **Compare with a script**) compares it with its script, and editors can press **Transcribe again**.',
          'For a converted Word file, **Original Word file** downloads the .docx exactly as it was uploaded.',
        ],
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Read, find, jump, play recordings, research selected words and check their continuity in Ask.' },
      { role: 'Editor, admin, owner', can: 'Also add facts, entities and notes from a selection, re-extract, edit, tag the document and set its cover.' },
    ],
    related: ['library', 'history', 'evidence', 'notes', 'entities', 'research', 'ask', 'shortcuts'],
    keywords: ['read', 'document', 'find', 'outline', 'select', 'add fact', 'add entity', 'add note', 'research', 'continuity', 're-extract', 'cover', 'word', 'transcript'],
  },
  {
    slug: 'history',
    group: 'documents',
    title: 'History',
    summary: 'Every version of a document, who added it and how, and a passage-by-passage comparison that shows which canon to re-check.',
    where: 'Reader → **History**, or Library → a row’s menu → **History**',
    shot: { name: 'history', alt: 'The history of a document: the version list on the left and a comparison of two versions with changed passages and the canon citing them.' },
    see: [
      { label: 'Versions', text: 'Each version with how it arrived (uploaded, written in CanonTracker, saved from a research note), who, when, its passage count and sha256. Badges mark the **Latest** version and the **Older side** and **Newer side** of the comparison.' },
      { label: 'Version pickers and layout', text: 'Pick the older and newer version, and read the comparison **Inline** or **Side by side**.' },
      { label: 'Summary', text: 'How many passages changed, were added or removed, and how many are unchanged, plus how many canon citations to re-check.' },
      { label: 'Passages', text: 'Each passage marked **Changed**, **Added** or **Removed**, with the words that changed. Runs of unchanged passages fold into one row; click it to read them.' },
      { label: 'Canon to re-check', text: 'Under a passage, every canon fact that cites it: **Evidence outdated** when its quote is gone, **Quote unchanged** when it still reads the same.' },
    ],
    tasks: [
      {
        title: 'Compare two versions',
        steps: [
          'Press the compare button on a version to compare it with the one before.',
          'Or pick any older and newer version at the top.',
          'Switch between **Inline** and **Side by side**.',
          'Read the badges under each changed passage to see which canon it touches.',
        ],
      },
      {
        title: 'Act on canon that may no longer hold',
        steps: [
          'Find a fact marked **Evidence outdated**.',
          'Use the buttons beside it to see the passage in the older and newer version.',
          'Press **Propose a change** if the fact no longer holds, and see its impact before it reaches a build.',
          'Use **All canon to re-check** to confirm or keep citations across the project.',
        ],
      },
    ],
    sections: [
      {
        title: 'Versions never change',
        text: 'A saved version is never edited. A new upload with the same file name, or a save from Edit, adds the next version, and canon that cites an older one is flagged to re-check. See [Versions and re-check](/help/versions-and-recheck).',
      },
    ],
    roles: [
      { role: 'Viewer', can: 'See every version and compare them.' },
      { role: 'Editor, admin, owner', can: 'Also propose a change for a fact whose evidence changed.' },
    ],
    related: ['reader', 'library', 'versions-and-recheck', 'changes', 'canon'],
    keywords: ['versions', 'diff', 'compare', 'what changed', 'outdated', 're-check', 'stale citation'],
  },
  {
    slug: 'script-vs-recording',
    group: 'documents',
    title: 'Script vs recording',
    summary: 'Compare a voice take with the script it was read from, line by line, and see which changed or added lines clash with canon.',
    where: 'Open a recording in the Library → **Script vs recording** (or **Compare with a script**)',
    shot: { name: 'voice', alt: 'Script vs recording for a town crier take: the script on the left, what was said on the right, with changed and not said lines and one line that contradicts canon.' },
    see: [
      { label: 'Script', text: 'The script this take was read from. Pick it from the list; **No script** unlinks it.' },
      { label: 'Summary', text: 'Counts of lines **As written**, changed, added and not said, how many lines contradict canon, and how many conflict within this take. **Only differences** hides the lines said as written.' },
      { label: 'Lines', text: 'Each row shows the script line with its line number and speaker on the left, and what was said, with a play button, on the right. Words cut from the script are struck through; new words are marked. Dialogue is read from “NAME: line” lines (any case when the name is a wiki name or alias) and from screenplay cues: a character name on its own line, with (V.O.) or (CONT’D) if any, above the speech. Scene headings, action and (beat) lines are not counted as spoken.' },
      { label: 'Flags', text: 'Under a changed or added line, each fact it states: **Contradicts canon** (with the canon fact) or **Conflicts with another line in this take** (with the other line and its time), or a note that no canon conflict was found.' },
    ],
    tasks: [
      {
        title: 'Add a recording',
        steps: [
          'In the Library or on Home, upload an audio file (MP3, WAV, M4A, OGG, WebM or FLAC, up to 30 minutes).',
          'Wait while it is transcribed; the transcript becomes a read-only document with timed passages.',
          'The AI proposes candidate facts from the transcript, as for any document.',
        ],
      },
      {
        title: 'Compare a take with its script',
        steps: [
          'Open the recording and press **Compare with a script**.',
          'Under **Script**, pick the scene or dialogue the take was read from.',
          'Read the rows marked **Changed**, **Added** and **Not said**.',
          'Press a play button to hear the line; a changed word may just be misheard.',
        ],
      },
      {
        title: 'Deal with a flagged line',
        steps: [
          'Read the flag: which rule it hit, how hard, and what it clashes with.',
          'Follow the link to the canon fact or the other line.',
          'Press **Review this candidate** to accept, edit or reject the fact in Review.',
        ],
      },
    ],
    sections: [
      {
        title: 'Good to know',
        points: [
          'Scripts are matched word by word. Lines written as `NAME: line` give each script line its speaker.',
          'The transcript is the source. Quotes are checked against it, not the audio, and it is never edited; transcribing again adds a new version.',
          'Only the deterministic conflict rules run on changed and added lines. No hit isn’t proof a line fits.',
          'Nothing here is stored or decided: the facts stay pending candidates until someone decides them in Review.',
        ],
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Read the comparison and play the lines.' },
      { role: 'Editor, admin, owner', can: 'Also upload recordings and link or change the script.' },
    ],
    related: ['reader', 'library', 'conflict-rules', 'review', 'conflicts'],
    keywords: ['voice', 'audio', 'recording', 'take', 'table read', 'transcript', 'script', 'voice actor', 'improvised', 'dialogue'],
  },
  {
    slug: 'write',
    group: 'documents',
    title: 'Write',
    summary: 'Write or paste a document in the app, keep it as a private draft, check it against canon, and save it to the story as a new version.',
    where: 'Home → **Write a document** or **New document**, Library → **Write a document**, or a document’s **Edit**',
    shot: { name: 'write', alt: 'The Write page: a title, kind buttons, the text of a scene, and the bar with Dictate, Check continuity, Focus and Save to story.' },
    see: [
      { label: 'Title and kind', text: 'The document’s title and its kind: **Scene**, **Lore**, **Character**, **Location**, **Quest**, **Dialogue** or **Other**.' },
      { label: 'Text', text: 'Your scene. A blank line starts a new passage; a line starting with `#` is a heading.' },
      { label: 'Continuity check', text: 'Appears after a check: findings against accepted canon with their sources, **Rule checks** from the rule engine, and a **Suggested fix · not applied** for each problem.' },
      { label: 'Bar', text: 'Word count and draft status, then **Dictate**, **Research this** (with words selected), **Check continuity**, **Ask**, **Focus**, **Discard draft** and **Save to story**.' },
      { label: 'Ask column', text: 'On wide screens, a chat beside the text for canon questions and research while you write.' },
    ],
    tasks: [
      {
        title: 'Write a new document',
        steps: [
          'Press **Write a document** in the Library or **New document** on Home.',
          'Type a title, pick a kind and write or paste the text.',
          'Keep writing: the draft saves as you type, and only you can see it.',
          'Press **Save to story**: it becomes a read-only document and the AI proposes candidate facts for Review.',
        ],
      },
      {
        title: 'Edit a saved document',
        steps: [
          'Open the document and press **Edit**.',
          'Change the text; the note at the top says which version saving will make.',
          'Press the save button to save it as the next version; the old version stays as it was and canon citing it is flagged to re-check.',
          'If someone saved a newer version meanwhile, use **See what changed**, start over from the latest, or save anyway.',
        ],
      },
      {
        title: 'Check a draft against canon',
        steps: [
          'Select some words, or select nothing to check the whole draft.',
          'Press **Check continuity** (it reads **Check selection** with words selected).',
          'Read each finding with the canon it cites, and the suggested fix.',
          'Change your text yourself; the check never edits it.',
        ],
      },
      {
        title: 'Dictate and write without distractions',
        steps: [
          'Press **Dictate**, speak, then press **Stop**: the words are typed in at the cursor.',
          'Press **Focus** (`Ctrl Shift F`) to show only the text, with a word count for the session.',
          'Turn on **Typewriter** to keep the line you’re typing near the middle.',
          'Press **Exit** or `Esc` to leave focus mode.',
        ],
      },
    ],
    sections: [
      {
        title: 'Good to know',
        points: [
          'Drafts are private and listed under **Your drafts** on [Home](/help/home). **Discard draft** throws one away for good.',
          'A continuity check of a draft is private to you, like the draft.',
          '**Research this** opens Ask in Research mode with your selected words in the question; the draft isn’t a source yet, so they go in as a quote, not a citation.',
          'Recording transcripts can’t be edited; transcribe the audio again instead.',
          '`Ctrl S` saves the draft right away. See [Keyboard shortcuts](/help/shortcuts).',
        ],
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Can’t write documents; the page says **View only**.' },
      { role: 'Editor, admin, owner', can: 'Write, edit, dictate, check continuity and save to the story.' },
    ],
    related: ['reader', 'library', 'history', 'ask', 'research', 'shortcuts'],
    keywords: ['write', 'draft', 'paste', 'new document', 'edit', 'save', 'focus mode', 'typewriter', 'dictation', 'microphone', 'continuity'],
  },
] satisfies HelpPage[]
