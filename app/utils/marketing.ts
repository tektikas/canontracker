// Public marketing site: navigation, feature pillars and use cases in one place, so the nav, the footer, the overview
// pages and the per-page routes agree. Every claim here must be true of the product today (AGENTS.md is the reference).

import type { IconName } from '~/components/ui/Icon.vue'

export const SITE = 'https://canontracker.trythis.work'
export const GITHUB = 'https://github.com/tektikas/canontracker'
export const LICENSE_URL = 'https://github.com/tektikas/canontracker/blob/master/LICENSE'
export const CONTACT = 'mailto:info@tektik.ai'
/** YouTube id of the three-minute demo video. Empty hides the landing's video section (and no player loads until a click). */
export const VIDEO_ID = 'tb1EZ1d2VSk'

/** A product screenshot in public/shots (light and dark, 720 and 1280 wide). */
export interface Shot { name: string, alt: string }
export interface Section { title: string, text: string, points: string[], shot?: Shot }

export interface Pillar { slug: string, title: string, short: string, art: string, lead: string, sections: Section[] }

export const PILLARS: Pillar[] = [
  {
    slug: 'canon',
    title: 'Canon and review',
    short: 'AI proposes facts with the exact quote. A person decides what becomes canon.',
    art: 'review',
    lead: 'The AI reads your documents and proposes facts, each tied to the sentence it came from. Nothing is canon until someone on your team accepts it, and every canon fact keeps its citation.',
    sections: [
      {
        title: 'Candidates, each with its source sentence',
        text: 'Import a document and the AI proposes characters, places, relationships, events and world rules. Every candidate carries a quote, and the quote is checked word for word against the passage before you see it.',
        points: ['Quotes match across smart quotes, dashes, line breaks and Markdown emphasis, and keep the source’s exact characters', 'A candidate whose quote isn’t in the source is blocked: it can’t be accepted', 'Re-extract a document any time; only new candidates are added'],
        shot: { name: 'review', alt: 'The review queue: a candidate whose quote is not in the source is blocked, with the source passage open beside it.' },
      },
      {
        title: 'A second opinion from the AI critic',
        text: 'A second AI reads each verified candidate with the paragraphs around it and the canon about the same names. It says keep, reject or needs edit, with a one-line reason such as figurative, duplicate or wrong subject. It is advice only and never changes a fact.',
        points: ['A flag stands only if two more readings with the whole document agree', '“Use in Edit & accept” fills in the critic’s suggested fix for you to check', 'Accept every candidate the critic keeps in one decision, or go one by one with the keyboard'],
        shot: { name: 'tide-review', alt: 'Review in Broken Tide: “Mara and Leya are sisters” with the AI critic marking it figurative.' },
      },
      {
        title: 'Canon you can browse, search and cite',
        text: 'Accepted facts form the canon: a filterable list grouped by kind, a relationship graph and a story timeline. Superseded facts are kept with their history, never deleted.',
        points: ['Every canon fact links to the exact passage it came from', 'Ask questions of canon; with no evidence the answer is “unknown”', 'Story time like D3 14:00, day-only D3, and days before the story starts'],
        shot: { name: 'canon', alt: 'The canon list of The Ashbell Pass, grouped by kind, with the source of each fact.' },
      },
    ],
  },
  {
    slug: 'conflicts',
    title: 'Conflicts and impact',
    short: 'Catch contradictions in canon and see what a change touches before you make it.',
    art: 'conflicts',
    lead: 'CanonTracker checks accepted canon for contradictions you would otherwise find in playtest or in a reader’s email. Before you change a fact, it shows which other facts and scenes depend on it.',
    sections: [
      {
        title: 'Conflicts with the rule that found them',
        text: 'Deterministic rules flag a character in two places at the same time, an approximate overlap, a trip that is faster than the known travel time, and a relationship used after it ended. The AI can also suggest world-rule violations; those are labelled as AI suggestions.',
        points: ['Hard and soft severity, so the real breaks come first', 'Decide each one: confirm, false positive or uncertain, with a reason', 'Both facts and both sources side by side'],
        shot: { name: 'conflicts', alt: 'Conflict candidates in The Ashbell Pass, a relationship used after it ended, with both cited facts.' },
      },
      {
        title: 'Impact before you change canon',
        text: 'Propose a change to a canon fact and CanonTracker lists the facts and scenes it may touch, up to two steps away within accepted canon. Each item shows the path, the evidence and why it is listed. If nothing turns up, it says “no impact found”, not “no impact”.',
        points: ['Accept and apply, or reject; an applied change can be reverted', 'Impacted scenes become re-review tasks', 'Export the impact list as JSON, CSV or Markdown'],
        shot: { name: 'impact', alt: 'A proposed change to the Ashbell rule with its possible review impact: four scenes and six related facts.' },
      },
    ],
  },
  {
    slug: 'wiki',
    title: 'Wiki and timeline',
    short: 'A page for every character, place and thing, filed from canon.',
    art: 'wiki',
    lead: 'Every name in accepted canon gets a wiki page with its facts, relationships, timeline and appearances. Summaries, portraits and notes are yours to add; they are labelled as editorial and never feed conflict checks.',
    sections: [
      {
        title: 'Entity pages that file themselves',
        text: 'Characters, locations, items, factions and events get pages as canon grows. Entity types are per project: a game project starts with NPC, item, ability and quest. Rename, recolour or add your own.',
        points: ['Tabs for story, timeline, relationships, appearances and notes', 'Portraits uploaded or generated with AI', 'Hover any known name in a document for a quick card'],
        shot: { name: 'entity', alt: 'The Saltgate entity page: what canon says about it, with sources.' },
      },
      {
        title: 'Merging names is a decision, and everything follows it',
        text: 'When “Salt Gate” and “Saltgate” are the same place, merge them. Facts move to the kept page, the old name becomes an alias, conflicts that depended on the split close, and change proposals whose impact moved are marked for a fresh analysis.',
        points: ['The merge is in the audit log with the full old page', 'A later candidate using a merged name is saved under the kept name'],
      },
      {
        title: 'Graph and timeline',
        text: 'See who is tied to whom in a relationship graph coloured by entity type, and when things happen on a story timeline that handles exact times, whole days and days before day one.',
        points: ['Filter the graph to one entity and its neighbours', 'Timeline bars show real durations'],
        shot: { name: 'timeline', alt: 'The story timeline of The Ashbell Pass with events across days.' },
      },
    ],
  },
  {
    slug: 'writing',
    title: 'Writing, import and voice',
    short: 'Markdown, text, Word and recordings in. Your files are never edited.',
    art: 'import',
    lead: 'Bring the documents you already have, write new ones in the app, or upload a recorded take. Sources are hashed and versioned and never changed, so every citation points at text that really exists.',
    sections: [
      {
        title: 'Import Markdown, text and Word',
        text: 'Drop .md, .txt or .docx files anywhere in the Library. Word files keep headings, lists, tables and footnotes; tracked changes are read as accepted, and Word comments become notes pinned to the words they were on. The original Word file is kept for download.',
        points: ['Same filename is a new version, same text is skipped', 'Folders, tags and kinds to keep a large Library in order', 'A version diff shows which canon facts cite changed passages'],
        shot: { name: 'library', alt: 'The Library of The Ashbell Pass with folders, kinds and tags.' },
      },
      {
        title: 'Read, write and add facts by hand',
        text: 'Read any document with find, outline and a version picker. Write or paste new documents in the app; drafts autosave privately. Select words to add a fact, an entity or a note, and run a continuity check of a draft against canon.',
        points: ['Add a fact from one sentence; who, where and when are filled in for you to check', 'Notes sit in the margin until they are done', 'When a new version changes a cited passage, the fact is flagged for re-check'],
        shot: { name: 'reader', alt: 'A document in the reader with its canon facts beside the text.' },
      },
      {
        title: 'Recordings as sources',
        text: 'Upload a voice-actor take, a table read or an interview. The transcript becomes a document with timed lines, and its citations play the moment they quote. Link the script, and CanonTracker compares what was said with what was written and flags lines that contradict canon.',
        points: ['MP3, WAV, M4A, OGG, WebM and FLAC, up to 30 minutes', 'Dictate into the editor and the Ask box', 'Your project’s names help the speech recognition'],
        shot: { name: 'voice', alt: 'Script vs recording: changed and missing lines of a town crier’s take, one line contradicting canon.' },
      },
    ],
  },
  {
    slug: 'export',
    title: 'Export and share',
    short: 'A story bible as Markdown, PDF or EPUB, and read-only share links.',
    art: 'export',
    lead: 'Hand the canon to people who don’t use the app: a story bible built from accepted canon only, each fact with its citations, plus the manuscript as a book.',
    sections: [
      {
        title: 'A story bible in the format people read',
        text: 'Download Markdown (or a .zip with portraits), print to PDF, or get an EPUB. The bible has a chapter per entity kind with numbered source notes; the manuscript lays out your latest documents in reading order.',
        points: ['Whole project, selected entities or one folder', 'Wiki text is optional and labelled “not canon”', 'Print always uses the light paper theme'],
        shot: { name: 'export', alt: 'Export and share: format, scope and sections for the story bible.' },
      },
      {
        title: 'Share links you control',
        text: 'Create a read-only link to the bible for a translator, an agent or a publisher. Links can expire after 7 or 30 days and be turned off at any time. They never show user names, notes, candidates or the audit log.',
        points: ['Only a hash of the link is stored', 'The first open is recorded in the audit log'],
      },
    ],
  },
  {
    slug: 'team',
    title: 'Team and roles',
    short: 'Studios, projects, four roles and an audit trail of every decision.',
    art: 'team',
    lead: 'Work alone or as a studio. Every decision carries the name of the person who made it, and the audit log keeps the full history.',
    sections: [
      {
        title: 'Studios, projects and roles',
        text: 'A studio holds your projects and your team. Members are owners, admins, editors or viewers. Viewers can read everything and ask questions; editors decide canon; admins manage the team and load samples.',
        points: ['Invite with a copyable link: role, expiry, single use, revocable', 'A studio always keeps one owner', 'Every project’s data is separate'],
        shot: { name: 'team', alt: 'Studio settings: members with roles and an invite link form.' },
      },
      {
        title: 'Ask, together',
        text: 'Ask is the team’s conversation with the canon. Every member sees every conversation and can post in it. Canon answers use accepted canon only, with sources; research answers use outside sources and are labelled as not canon.',
        points: ['Attach a passage, an entity or a conflict as context', 'A vague “she” gets a follow-up question, not a guess'],
        shot: { name: 'ask', alt: 'An Ask conversation: a canon answer with verbatim, cited claims.' },
      },
      {
        title: 'An audit trail nobody can rewrite',
        text: 'Imports, decisions, merges, changes, exports and share links are recorded in an append-only audit log, with who did it and when. The Agent activity page lists every AI run and what people did with its output.',
        points: ['Removed members keep their name on past decisions', 'Export the audit log as JSON or Markdown'],
        shot: { name: 'agent-activity', alt: 'Agent activity: every AI run, its steps and what happened to its output.' },
      },
    ],
  },
]

export interface UseCase { slug: string, title: string, nav: string, art: string, sample: string, lead: string, jobs: { title: string, text: string }[], shots: Shot[] }

export const USE_CASES: UseCase[] = [
  {
    slug: 'novelists',
    title: 'For novelists and series authors',
    nav: 'Novelists',
    art: 'novelists',
    sample: 'Lantern Row, a short prose sample with preloaded canon and one planted timing conflict.',
    lead: 'Keep a long book or a series straight: who was where, what the rules of the world are, and which chapters a change will reach.',
    jobs: [
      { title: 'Turn drafts into a reference', text: 'Import chapters as Markdown or Word. The AI proposes facts with the sentence they came from; you keep what is true.' },
      { title: 'Catch slips before your editor does', text: 'A character at the glassworks and the bell tower at the same hour, or a sister who is a sister only figuratively.' },
      { title: 'Revise with the impact in front of you', text: 'Change a fact and see which chapters cite something that depends on it.' },
      { title: 'Hand over a clean bible', text: 'Export the canon as a book with notes, or the manuscript as an EPUB.' },
    ],
    shots: [
      { name: 'lantern', alt: 'Lantern Row canon: five sample facts, each with its source.' },
      { name: 'tide-review', alt: 'Broken Tide review: the AI critic marks a figurative “sisters” candidate.' },
    ],
  },
  {
    slug: 'games',
    title: 'For game studios and narrative designers',
    nav: 'Game studios',
    art: 'games',
    sample: 'The Ashbell Pass, a 28-document game story with locations, NPCs, dialogue, a recorded take and planted contradictions.',
    lead: 'Narrative teams write lore, quest scripts and barks across many documents and many hands. CanonTracker keeps one canon that every writer, and every tool, can check.',
    jobs: [
      { title: 'One canon for the whole team', text: 'Lore docs, quest scripts and dialogue in one Library. Entity types for NPCs, items, abilities and quests.' },
      { title: 'Check the recording against the script', text: 'Upload a voice take, link its script, and see changed lines and lines that contradict canon.' },
      { title: 'Change a world rule safely', text: 'Change the bell rule and see the four scenes to re-review, with re-review tasks for the team.' },
      { title: 'Let your tools work with canon', text: 'Give an agent or a pipeline a token through MCP. Agents read canon, check facts and propose; their proposals wait in Review, and a person decides in CanonTracker.' },
    ],
    shots: [
      { name: 'voice', alt: 'Script vs recording for a town crier’s take, one line contradicting canon.' },
      { name: 'conflicts', alt: 'Conflict candidates in The Ashbell Pass.' },
    ],
  },
  {
    slug: 'screen',
    title: 'For TV and film writers’ rooms',
    nav: 'TV and film',
    art: 'screen',
    sample: 'Broken Tide, eleven short scenes with a world rule, a figurative “sister” and a scene-level change to trace.',
    lead: 'A writers’ room produces outlines, scene scripts and table reads faster than anyone can cross-check them. CanonTracker keeps the facts of the show in one cited place.',
    jobs: [
      { title: 'Scene by scene, with sources', text: 'Every fact cites the scene and line it came from, so a question in the room has an answer with a quote.' },
      { title: 'Table reads as sources', text: 'Upload the recording; the transcript is timed, and citations play the line.' },
      { title: 'Know which scenes a rewrite touches', text: 'Change a rule and get the list of scenes to re-review, two steps deep at most.' },
      { title: 'Planned: episodes and reveals', text: 'Release order separate from story time and canon “as of” an episode are on the roadmap, not built yet.' },
    ],
    shots: [
      { name: 'impact', alt: 'A proposed change with the scenes and facts it may touch.' },
      { name: 'reader', alt: 'A scene in the reader with its canon facts beside it.' },
    ],
  },
  {
    slug: 'worldbuilding',
    title: 'For worldbuilders, game masters and creators',
    nav: 'Worldbuilders',
    art: 'worldbuilding',
    sample: 'Broken Tide and The Ashbell Pass, both built around world rules that later change.',
    lead: 'Rules of magic, travel times between places, histories that start long before day one, whether the world lives in a campaign, a webcomic, a serial or a video series. CanonTracker keeps them as cited facts and checks the story against them.',
    jobs: [
      { title: 'Rules as canon', text: 'A world rule is a fact with a source. The AI suggests where a scene may break it, labelled as a suggestion.' },
      { title: 'Distances and timing', text: 'Travel times are facts too: a trip that is faster than the road allows is flagged.' },
      { title: 'A wiki that stays in step', text: 'Pages for every place, faction and item, with a graph of how they connect.' },
      { title: 'Research outside the story', text: 'Ask real-world questions with sources and calculators; answers stay research notes until you promote one for review.' },
    ],
    shots: [
      { name: 'graph', alt: 'The relationship graph of The Ashbell Pass, coloured by entity type.' },
      { name: 'entity', alt: 'The Saltgate wiki page.' },
    ],
  },
]

export const AUDIENCES = { novelists: 'Novelists', screen: 'TV & film', games: 'Games', worldbuilders: 'Worldbuilders' } as const
export interface RoadmapItem { title: string, text: string, for?: (keyof typeof AUDIENCES)[] }
export interface RoadmapStage { id: 'shipped' | 'building' | 'next' | 'later', title: string, lead: string, items: RoadmapItem[] }

/** /roadmap. Shipped items must be true today (AGENTS.md, /changelog); the rest is planned, with no dates. */
export const ROADMAP: RoadmapStage[] = [
  {
    id: 'shipped',
    title: 'Shipped recently',
    lead: 'In CanonTracker today. Every change is on the changelog.',
    items: [
      { title: 'Upload a whole manuscript', text: 'One file of a book splits into chapters, in reading order, in a folder of its own. Upload it again and only the chapters you changed get a new version.', for: ['novelists'] },
      { title: 'Reading in the background', text: 'An upload answers at once while the AI reads it, with live status in the Library, on the document and in Review, and a plain reason and Try again if a run fails.' },
      { title: 'Story or reference, told apart', text: 'The AI says whether a document is story or reference notes as it reads, so a glossary filed as “chapter 12” is still sorted as lore.', for: ['novelists', 'worldbuilders'] },
      { title: 'Canon decisions stay human', text: 'Connected agents read, check and propose. Accepting, rejecting, merging and deciding conflicts happen only in the app, by a person, whatever the agent’s token allows.' },
      { title: 'Six samples to explore', text: 'Three original stories, one of them a game, and three public-domain classics: Sherlock Holmes, the Oz books and Alice.' },
      { title: 'A timeline in reading order', text: 'A novel without clock times still gets a timeline: each fact sits in the chapter that tells it.', for: ['novelists'] },
      { title: 'Same detail, two answers', text: 'Flags one character with two answers for a detail that can only have one, like a wound in the shoulder and in the leg, with both quotes.' },
    ],
  },
  {
    id: 'building',
    title: 'Building now',
    lead: 'In progress this week. Each item moves to the changelog when it ships.',
    items: [
      { title: 'A new version from any file name', text: 'Upload “ch3-final-v2.docx” and choose the document it replaces, instead of starting a new one.' },
      { title: 'Archive documents', text: 'Put a retired document out of the way without losing its history or the canon that cites it.' },
      { title: 'Revert to an earlier draft', text: 'Bring an earlier version back as the newest one; the versions in between stay readable.' },
      { title: 'More formats as text', text: 'Fountain screenplays, Yarn and Ink dialogue, CSV and JSON files import as sources like any document.', for: ['screen', 'games', 'worldbuilders'] },
      { title: 'Screenplay cues in script vs recording', text: 'A table read lines up with a script in screenplay format, not only “NAME: line” scripts.', for: ['screen', 'games'] },
      { title: 'The medium, asked up front', text: 'A new project asks whether it is prose, a game or for the screen, so labels and entity types fit from the start.' },
      { title: 'Episodes in natural order', text: 'Episode 2 comes before Episode 10 in the Library and in reading order.', for: ['screen', 'novelists'] },
      { title: 'Impact across every kind of document', text: 'A proposed change shows what it touches in quests, lore and episodes, not just scenes.', for: ['games', 'screen', 'worldbuilders'] },
      { title: 'Acts after death', text: 'A conflict for a character who speaks or acts after canon says they died.' },
      { title: 'Review by document or folder', text: 'Work through the candidates from one chapter or one folder at a time.' },
      { title: 'Open conflicts in exports', text: 'The exported story bible lists the conflicts still open, so readers see what isn’t settled.' },
      { title: 'Entity type when adding a fact', text: 'Say whether a new name is a character, a place, an item or something else when you add a fact by hand.' },
      { title: 'Big wiki pages for agents', text: 'Connected agents read a large character or place page in parts instead of hitting a size limit.' },
    ],
  },
  {
    id: 'next',
    title: 'Next',
    lead: 'Planned after the current work. Not built yet.',
    items: [
      { title: 'In-world calendars', text: 'Your world’s own months, eras and years, instead of numbered days.', for: ['worldbuilders', 'games', 'novelists'] },
      { title: 'Project roles and secret canon', text: 'Give someone a role in one project only, and keep GM-only facts that share links never show.', for: ['games', 'worldbuilders'] },
      { title: 'One fact, many sources', text: 'A fact told in three chapters cites all three, so cutting one scene doesn’t leave it unsupported.' },
      { title: 'Change sets', text: 'One proposed change that touches many facts, like a renamed city or a moved date, with its impact shown as a whole.' },
      { title: 'More imports', text: 'PDF, Final Draft (.fdx), an Obsidian vault and a zip of many files.', for: ['screen', 'worldbuilders', 'novelists'] },
      { title: 'Localisation glossary', text: 'Every name, alias and term as CSV or JSON, ready for translators.', for: ['games', 'screen'] },
      { title: 'Word export with tracked changes', text: 'Export to Word with tracked changes kept, for editors who work there.', for: ['novelists', 'screen'] },
      { title: 'Names that change over time', text: 'Dated aliases and titles: the princess who is crowned in book two stays one person, with the right name for each moment.', for: ['novelists', 'worldbuilders'] },
      { title: 'Who knows what, when', text: 'A rule that flags a character acting on something they haven’t learned yet.', for: ['novelists', 'screen', 'games'] },
    ],
  },
  {
    id: 'later',
    title: 'Later',
    lead: 'On the list, further out.',
    items: [
      { title: 'A series across projects', text: 'Canon that carries from book 1 to book 3, or from season 1 to season 2.', for: ['novelists', 'screen'] },
      { title: 'Maps and places within places', text: 'Pins on your own map, and a district inside a city inside a kingdom.', for: ['worldbuilders', 'games'] },
      { title: 'Assign review work', text: 'Hand a teammate a batch of candidates or conflicts and see what is left.', for: ['screen', 'games'] },
      { title: 'A commenter role', text: 'Editors and beta readers comment on documents without changing text or canon.', for: ['novelists'] },
    ],
  },
]

export const MARKETING_PAGES = [
  '/features', ...PILLARS.map(p => `/features/${p.slug}`), ...USE_CASES.map(u => `/use-cases/${u.slug}`),
  '/agents', '/security', '/pricing', '/changelog', '/roadmap', '/about', '/pitch',
]
/** Public pages that render the same for everyone (the middleware lets them through without a project). Help too. */
export const isMarketingPath = (path: string) => {
  const p = path.replace(/\/$/, '') || '/'
  return MARKETING_PAGES.includes(p) || p === '/help' || p.startsWith('/help/')
}

/** Title, description and social card for a marketing page. `image` is an og-*.png in public/. */
export function useMarketingSeo(o: { title: string, description: string, image?: string, path: string }) {
  const image = `${SITE}/${o.image ?? 'og-default'}.png`
  const title = o.title.includes('CanonTracker') ? o.title : `${o.title} · CanonTracker`
  useSeoMeta({
    title, description: o.description,
    ogTitle: title, ogDescription: o.description, ogImage: image, ogUrl: SITE + o.path, ogImageAlt: 'CanonTracker',
    twitterCard: 'summary_large_image', twitterTitle: title, twitterDescription: o.description, twitterImage: image,
  })
  useHead({ link: [{ rel: 'canonical', href: SITE + o.path }] })
}

export interface Agent { name: string, icon: IconName, does: string, never: string, model: string }

/** The AI helpers, in the order a story meets them. `model` is shown only where provenance is the point (/agents). */
export const AGENTS: Agent[] = [
  { name: 'Extractor', icon: 'file', model: 'Muse Spark', does: 'Reads each imported document and proposes characters, places, relationships, events and rules, each with the quote it came from.', never: 'Never makes anything canon. A candidate whose quote isn’t in the source is blocked.' },
  { name: 'Critic', icon: 'review', model: 'Muse Spark', does: 'Gives a second opinion on every verified candidate: keep, reject or needs edit, with a reason like figurative or duplicate.', never: 'Advice only. It never accepts, rejects or edits a fact.' },
  { name: 'Continuity', icon: 'conflicts', model: 'Muse Spark', does: 'Checks a draft or a passage against accepted canon with CanonTracker’s own read tools, and reports contradictions, dependencies and new facts.', never: 'A finding must quote your text and cite real canon, or it is dropped. Fixes are suggestions; nothing is applied.' },
  { name: 'Research', icon: 'research', model: 'Muse Spark with web search', does: 'Answers real-world questions with web sources and calculators for physics, calendars, the sky and period travel.', never: 'Research notes are never canon. You can promote one, and it then waits in Review like any candidate.' },
  { name: 'Voice', icon: 'mic', model: 'Muse Voice Transcribe', does: 'Turns recordings into timed transcripts, and dictation into text in the editor and in Ask.', never: 'The transcript is kept as heard and never edited. A failed transcription is shown, never filled in.' },
  { name: 'Ask', icon: 'ask', model: 'Muse Spark', does: 'Answers questions from accepted canon only, with the facts and quotes it used.', never: 'With no evidence the answer is “unknown”. It never invents a source or a quote.' },
]
