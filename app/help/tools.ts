import type { HelpPage } from './types'

export default [
  {
    slug: 'ask',
    group: 'tools',
    title: 'Ask',
    summary: 'Team conversations about your story: Canon answers from accepted canon with sources, Research looks up the real world and never becomes canon.',
    where: 'Sidebar → **Ask**, or the floating **Ask** button on any page (`Ctrl J` / `⌘J`)',
    shot: { name: 'ask', alt: 'Ask in The Ashbell Pass sample: the conversation list on the left, a Canon answer with its cited facts and source quotes on the right, and the composer with the Canon and Research switch.' },
    see: [
      { label: 'Conversations', text: 'Every conversation in the project, newest activity first, with a Canon or Research icon, who took part and when. **Search conversations** looks through titles and message text. **New** starts an empty one.' },
      { label: 'Conversation header', text: 'The title (the first question), who started it and when. Everyone on the project can read and reply.' },
      { label: 'Messages', text: 'Each question keeps its author. Canon answers are marked **From your canon** with a badge: **Supported by canon**, **Related canon only** or **Unknown**. Open **Sources** to read the cited facts and their quotes. Research answers are marked "From research, outside sources, not canon" and link to the full research note.' },
      { label: 'Composer', text: 'The **Canon** / **Research** switch, **Check continuity** (in Canon mode), any attached context chips, the question box, **Speak** to dictate and **Send**.' },
    ],
    tasks: [
      {
        title: 'Ask the canon a question',
        steps: [
          'Open **Ask** and choose **New**, or type in an open conversation to continue it.',
          'Make sure the switch below the conversation is on **Canon**.',
          'Type your question and press `Enter` (or **Send**); `Shift Enter` adds a new line.',
          'Read the answer and open **Sources** to check the facts and quotes it rests on.',
          'If no accepted fact answers it, the badge says **Unknown**: nothing was guessed.',
        ],
      },
      {
        title: 'Answer a follow-up',
        steps: [
          'If your question says "she" or "he" and several people fit, the answer asks who you mean instead of guessing.',
          'Pick one of the offered names, or type your answer in the box.',
          'The next message in the same mode continues that question; when only one person fits, the answer shows who it was asked about.',
        ],
      },
      {
        title: 'Ask about a passage or page',
        steps: [
          'Open the document, entity or conflict you want to ask about.',
          'Open Ask with the floating **Ask** button or `Ctrl J` / `⌘J`; what the page is about appears as chips above the box.',
          'Remove any chip you do not want to send with its close button.',
          'Type your question and send it; the chips go with your message.',
        ],
      },
      {
        title: 'Check a passage for continuity',
        steps: [
          'In the reader, select words and choose **Check continuity** (`C`); the check starts in the chat.',
          'Or type or paste a passage into the box in Canon mode and choose **Check continuity** above it.',
          'Wait for the report: it can take a minute.',
          'Read each finding with the canon facts it cites; suggested fixes are text only and never change your documents.',
        ],
      },
    ],
    sections: [
      {
        title: 'Canon or Research',
        points: [
          'Canon answers only from accepted canon and cites it. No evidence means "unknown".',
          'Research is for real-world questions: history, science, procedure. It uses outside sources, is slower, and is never added to canon. See [Research](/help/research).',
          'Each message keeps its own mode; you can switch modes within one conversation.',
        ],
      },
      {
        title: 'Ask everywhere',
        text: 'Outside the Ask page the chat opens as a drawer on the right. Its menu lists **New conversation**, recent conversations and **All conversations**; **Open in Ask** shows the open one full size. The reader has its own Ask tab in the side panel, and Write shows a chat column on wide screens. Teammates’ new messages appear on their own while the page is open.',
      },
      {
        title: 'How was this made?',
        text: 'Every AI answer links to **How was this made?**, which opens the run in [Agent activity](/help/agent-activity).',
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Read every conversation, start new ones and post in any of them, in Canon or Research mode, and check continuity.' },
      { role: 'Editor, admin, owner', can: 'Everything a viewer can, plus **Rename** a conversation.' },
    ],
    related: ['research', 'candidates-and-canon', 'evidence', 'agent-activity', 'reader', 'shortcuts'],
    keywords: ['chat', 'question', 'answer', 'conversation', 'drawer', 'unknown', 'follow-up', 'continuity', 'voice', 'dictate'],
  },
  {
    slug: 'research',
    group: 'tools',
    title: 'Research',
    summary: 'Ask how the real world works and get an answer with checked sources and calculations, kept as a note for the team. Never canon.',
    where: 'Sidebar → **Research**, Research mode in [Ask](/help/ask), or **Research this** on selected words in the reader (`R`)',
    shot: { name: 'research', alt: 'The Research page: the question box above a list of research notes, each with its verdict badge, question, answer and source count.' },
    see: [
      { label: 'Question box', text: 'Type a real-world question and choose **Research**. `Enter` asks; `Shift Enter` adds a new line.' },
      { label: 'Verdict tabs and search', text: 'Filter notes by verdict (established, plausible but speculative, contradicts known science or history, unknown) or search questions and answers.' },
      { label: 'Notes', text: 'Each note shows its verdict, the question, the answer, who asked and how many sources were verified.' },
      { label: 'A note', text: 'The answer and why it got its verdict, then **Claims**, **Sources**, **Calculations** and **How this was researched**.' },
    ],
    tasks: [
      {
        title: 'Research a question',
        steps: [
          'Open **Research** and type your question, for example about a date, a distance or a historical procedure.',
          'Choose **Research** and wait; searching sources and running the numbers can take a minute or two.',
          'If it needs one more detail, pick an option or type your answer and choose **Answer** (or **Start over**).',
          'The finished note opens on its own page.',
        ],
      },
      {
        title: 'Check what backs an answer',
        steps: [
          'Under **Claims**, each claim shows what backs it: a numbered source, a calculation, or **Model knowledge, unverified**.',
          'Under **Sources**, each page was fetched and its quote looked up word for word: **Quote found on the page**, **Not verified** (with why) or **Source not text-checked** (PDFs and other non-text files).',
          'Under **Calculations**, numbers come from fixed calculators, with their inputs and assumptions, not from the AI.',
          'A note is shown as established only when every claim has a verified source or a calculation; otherwise it is shown as speculative and says which sources were not verified.',
        ],
      },
      {
        title: 'Promote a note to a candidate',
        steps: [
          'On the note, choose **Promote to a candidate**.',
          'Choose **Fact** or **World rule**, fill in the subject (and for a fact the kind, predicate and object), and write the **Statement**.',
          'Under **Backed by these words from the note**, pick the sentence the candidate cites.',
          'Choose **Send to Review**: the note is saved read-only in the Library’s Research folder and the candidate waits in [Review](/help/review) until someone accepts it.',
        ],
      },
      {
        title: 'Pin a note to a passage',
        steps: [
          'On the note, choose **Pin to a passage**.',
          'Pick the **Document** and paste a phrase from the passage under **Words from the passage**.',
          'Choose **Pin**; the words must appear in that passage of the latest version.',
          'Use **Move pin** or **Unpin** later; pinning never changes the text or canon.',
        ],
      },
    ],
    sections: [
      {
        title: 'Research profile',
        text: 'Each project can describe its world for research: **Field**, **Period**, **Place**, **Legal system or procedure** and **Notes for research**. It is sent with every research question so answers fit your setting. Find it under Settings → [Projects](/help/projects) → a project → **Research profile**.',
      },
      {
        title: 'Limits',
        text: 'Research runs are limited per person and per project every 10 minutes. Over the limit you get a plain message; try again a little later.',
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Read every research note, and research in [Ask](/help/ask) conversations.' },
      { role: 'Editor', can: 'Ask on the Research page, promote notes to candidates and pin or unpin them.' },
      { role: 'Admin, owner', can: 'Everything an editor can, plus edit the project’s research profile.' },
    ],
    related: ['ask', 'review', 'candidates-and-canon', 'projects', 'reader'],
    keywords: ['real world', 'sources', 'verified', 'verdict', 'calculator', 'history', 'science', 'promote', 'pin', 'profile'],
  },
  {
    slug: 'agent-activity',
    group: 'tools',
    title: 'Agent activity',
    summary: 'Every AI run in the project: which agent, what it was about, each step it took, and what people did with the result.',
    where: 'Sidebar → **Agent activity**, or **How was this made?** under an AI answer',
    shot: { name: 'agent-activity', alt: 'Agent activity in The Ashbell Pass sample: a list of AI runs, each with its agent badge, time, outcome, steps and duration.' },
    see: [
      { label: 'Agent filter', text: 'Show **All agents** or one: Extractor, Critic, Research, Continuity, Ask, Rule check, Images or Transcribe.' },
      { label: 'Runs', text: 'Newest first. Each row shows the agent, when it ran, what it was about, the outcome, the number of AI steps and tool calls, time and tokens. Failed runs are marked **Failed** with the error.' },
      { label: 'Run details', text: 'Open a row to see the model id and prompt version (for provenance), the effort, what the run was for with a link to it, and what happened **Afterwards**.' },
      { label: 'Steps', text: 'A table of every step: what ran (the AI, a web search or a tool), its input, its result, time and tokens. A continuity run also shows its report.' },
    ],
    tasks: [
      {
        title: 'See how an answer was made',
        steps: [
          'Under an AI answer, a research note or a continuity report, choose **How was this made?**.',
          'Agent activity opens on that one run with its steps expanded.',
          'Choose **All runs** to go back to the full list.',
        ],
      },
      {
        title: 'Check what happened to extracted candidates',
        steps: [
          'Choose Extractor or Critic in the agent filter.',
          'Read the outcome on each row: how many candidates were accepted, rejected or are still waiting in Review.',
          'Open a row and follow the link to the document it read.',
        ],
      },
    ],
    sections: [
      {
        title: 'Advice, not decisions',
        text: 'The runs here only proposed or answered. Nothing an agent did became canon on its own; the **Afterwards** line shows what people decided. A continuity check of a private draft is shown only to its author.',
      },
    ],
    roles: [
      { role: 'Every member', can: 'Read every run in the project (except continuity checks of other people’s drafts).' },
    ],
    related: ['metrics', 'ask', 'research', 'review', 'audit'],
    keywords: ['AI runs', 'trace', 'provenance', 'model', 'prompt version', 'tokens', 'steps', 'receipts'],
  },
  {
    slug: 'metrics',
    group: 'tools',
    title: 'Metrics',
    summary: 'Score the project against a small hand-labelled gold set and see every model call: the developer view of how the AI behaves.',
    where: 'Sidebar → **Metrics**',
    shot: { name: 'metrics', alt: 'The Measurements page: the latest score with met and missed targets, the results table and the list of model calls.' },
    see: [
      { label: 'Score', text: 'How many targets the latest run met, a bar with one mark per target, when it ran and which gold set it used.' },
      { label: 'Latest run', text: 'Each measure with its target, what was measured and **Met**, **Missed** or **Info**.' },
      { label: 'Earlier runs', text: 'Past runs with their met and missed counts.' },
      { label: 'Model calls', text: 'Every call to the model: time, purpose, model id and prompt version (for provenance), inputs, result and latency. Prompts, keys and full documents are not stored.' },
    ],
    tasks: [
      {
        title: 'Run the evaluation',
        steps: [
          'Load Broken Tide or The Ashbell Pass into a project of its own (the evaluation scores those samples and the Sherlock Holmes sample).',
          'Review candidates, scan conflicts and decide them as you would normally.',
          'On **Metrics**, choose **Run evaluation**.',
          'Read the score and the **Latest run** table; it scores the data as it is now.',
        ],
      },
    ],
    sections: [
      {
        title: 'What the score means',
        text: 'The gold set is small and hand-labelled. It checks that the system behaves as designed on the sample story; it is not evidence of real-world accuracy. In a project without a gold set the page says there is nothing to measure and links to **Open projects**.',
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Read the scores and the model calls.' },
      { role: 'Editor, admin, owner', can: 'Also **Run evaluation**.' },
    ],
    related: ['agent-activity', 'projects', 'review', 'conflicts'],
    keywords: ['measurements', 'evaluation', 'gold set', 'score', 'targets', 'model calls', 'latency'],
  },
  {
    slug: 'audit',
    group: 'tools',
    title: 'Audit log',
    summary: 'The append-only history of imports, proposals, human decisions and canon changes, in plain sentences. Nothing here can be edited.',
    where: 'Sidebar → **Audit log**',
    shot: { name: 'audit', alt: 'The Audit trail page: event type filters above a day-by-day list of events, each with its time, type and a one-line description.' },
    see: [
      { label: 'Export', text: '**Export JSON** and **Export Markdown** download the whole trail.' },
      { label: 'Filters', text: '**All**, then one button per event type (document, candidate, conflict, change, research…) with its count.' },
      { label: 'Events by day', text: 'Each event shows its time, its type and one sentence saying who did what, with details such as the reason given and a link to what it touched.' },
    ],
    tasks: [
      {
        title: 'Find who decided something',
        steps: [
          'Open **Audit log**.',
          'Choose an event type, for example candidate or conflict, to narrow the list.',
          'Read the sentence: it names the person, what they decided and the reason they gave.',
          'Follow the link under the event to open the fact, conflict or document.',
        ],
      },
      {
        title: 'Export the trail',
        steps: [
          'Open **Audit log**.',
          'Choose **Export JSON** for tools or **Export Markdown** for people.',
        ],
      },
    ],
    sections: [
      {
        title: 'What it records',
        points: [
          'Every event is kept; nothing is changed or removed, and superseded facts stay in history.',
          'Actions done through an agent token are still the person’s own, marked with "via agent" and the token’s name.',
          'Loading a sample clears the project but keeps its trail; links to things the reset removed say "(removed by reset)".',
          'Conflicts and Changes link straight to their events here.',
        ],
      },
    ],
    roles: [
      { role: 'Every member', can: 'Read and export the audit log. No one can edit it.' },
    ],
    related: ['review', 'conflicts', 'changes', 'agents-api', 'roles'],
    keywords: ['history', 'trail', 'who', 'decision', 'log', 'append-only', 'export'],
  },
  {
    slug: 'export',
    group: 'tools',
    title: 'Export & share',
    summary: 'Hand the story bible to writers, voice directors, localisation or a publisher: Markdown, PDF, EPUB or a read-only link, accepted canon only.',
    where: 'Sidebar → **Export & share**',
    shot: { name: 'export', alt: 'Export & share in The Ashbell Pass sample: format, scope and section choices on the left, download counts and buttons and read-only links on the right.' },
    see: [
      { label: 'What goes in', text: 'The **Format** (**Report**, **Story bible as a book** or **Manuscript**), the **Scope** (**Whole project**, **Selected entities** or **One folder**), the sections to include and **Include portraits**.' },
      { label: 'Download', text: 'Counts of canon facts, entities and sources (or documents and words for a manuscript), then **Download Markdown**, **Save as PDF** or **Book as PDF**, and **Download EPUB** for book formats.' },
      { label: 'Read-only links', text: 'Active links with their scope, expiry and how often they were opened; turned-off and expired links below. **Create link** makes a new one.' },
    ],
    tasks: [
      {
        title: 'Download the story bible',
        steps: [
          'Under **Format**, keep **Report** for facts with their source quotes.',
          'Pick a **Scope** and tick the sections you want; editorial notes are marked "not canon" and are off by default.',
          'Choose **Download Markdown** for a .md file (a .zip with an images folder when portraits are included).',
          'Or choose **Save as PDF**, then pick "Save as PDF" as the printer in the print dialog.',
        ],
      },
      {
        title: 'Make a book or the manuscript',
        steps: [
          'Under **Format**, choose **Story bible as a book** (cover, contents, a chapter per kind of entity, citations as notes) or **Manuscript** (your documents, latest versions, in reading order).',
          'Pick the **Scope**; a manuscript covers the whole project or one folder.',
          'Choose **Book as PDF** and print it with A4, default margins and headers and footers off, or choose **Download EPUB**.',
        ],
      },
      {
        title: 'Share a read-only link',
        steps: [
          'Set up **What goes in** the way you want the link to show it (links share the report, not the manuscript).',
          'Choose **Create link**, give it a **Name** for who it is for, and pick when it **Expires**: 7 days, 30 days or never.',
          'Choose **Create link**, then **Copy link** right away: the link cannot be shown again.',
          'Send it; people open it without signing in and see only this bible.',
        ],
      },
      {
        title: 'Turn off a link',
        steps: [
          'Under **Read-only links**, choose **Turn off** on the link.',
          'Confirm with **Turn off link**; anyone who opens it now sees that the link is not available.',
          'Lost a link? Turn it off and make a new one.',
        ],
      },
    ],
    sections: [
      {
        title: 'What an export holds',
        points: [
          'Accepted canon only, every fact with the exact source words it rests on. Sample canon is marked as such.',
          'Facts citing an older source version are flagged in the export.',
          'A shared link shows no drafts, candidates, notes, team members or other projects.',
          'PDFs always print in the light theme.',
        ],
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Download Markdown, PDF and EPUB exports.' },
      { role: 'Editor, admin, owner', can: 'Also create read-only links and turn them off.' },
    ],
    related: ['canon', 'entities', 'library', 'evidence', 'candidates-and-canon'],
    keywords: ['download', 'markdown', 'pdf', 'epub', 'book', 'manuscript', 'share link', 'print', 'publisher', 'localisation'],
  },
] satisfies HelpPage[]
