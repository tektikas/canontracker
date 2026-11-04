<script setup lang="ts">
definePageMeta({ layout: 'marketing' })
useMarketingSeo({ title: 'Changelog', description: 'What shipped in CanonTracker, day by day, from day one of the hackathon.', path: '/changelog' })

// From day one (27 Oct). From 30 Oct: the merge commits on master (git log --merges); before that, the project notes (no repo yet).
// One line per shipped change, newest first. 1 Nov had no commits.
const DAYS: { date: string, label: string, entries: [string, string][] }[] = [
  { date: '2026-11-04', label: 'Day 9 · 4 Nov 2026', entries: [
    ['Canon decisions are human-only', 'Agents read canon, check facts and propose; a person decides in CanonTracker. Accepting, rejecting, changes, conflicts, citation re-checks and merges are no longer offered over MCP and are refused for every token. Full access now means editorial edits as you. 37 tools.'],
  ] },
  { date: '2026-11-03', label: 'Day 8 · 3 Nov 2026', entries: [
    ['Renamed to CanonTracker', 'A graphite and signal-orange palette and a canon-track mark. The product was then called Story Bible in earlier releases.'],
    ['Same detail, two answers', 'A new conflict rule: one character, two different answers for a detail that can only have one (Watson’s wound: shoulder or leg). Deterministic, with both quotes.'],
    ['Sherlock Holmes sample', 'Seven public-domain works, 31 documents and 127,000 words, with the famous continuity slips as a gold set.'],
    ['Muse Code', 'Connects to CanonTracker over MCP from its settings file; the first example in Settings and on this site.'],
    ['This website', 'Feature, use-case, agents, security, pricing and changelog pages; art and icons in the writer palette; a light and dark switch.'],
    ['MCP parity', 'Agents can do almost everything people do in a project through MCP (team changes, sample loads, audio uploads and downloads stay in the app): 38 tools. Tokens are propose-only or full access (acts as you), and decisions made by an agent show “via agent”.'],
    ['Open source', 'CanonTracker is licensed under AGPL-3.0.'],
    ['Plain AI labels', 'The product says “AI” everywhere; which model ran is on Agent activity and Metrics.'],
  ] },
  { date: '2026-11-02', label: 'Day 7 · 2 Nov 2026', entries: [
    ['Continuity check', 'Check a draft or a passage against canon; every finding quotes your text and cites real canon. New Agent activity page lists every AI run.'],
    ['AI critic', 'A confirmed second opinion on each candidate in Review: keep, reject or needs edit, with a reason.'],
    ['Word import', '.docx files with tracked changes, footnotes and tables; Word comments become notes.'],
    ['Voice', 'Recordings become timed sources, script vs recording checks, and dictation in the editor and Ask.'],
    ['Research', 'Real-world questions answered with checked web sources and calculators; notes never become canon on their own.'],
    ['Team conversations in Ask', 'Shared conversations with a canon or research switch, follow-up questions and a chat drawer on every page.'],
    ['A writer’s palette', 'Linen, paper and walnut ink in light; warm wood in dark.'],
    ['The Ashbell Pass', 'A third sample: a 28-document game story with planted contradictions.'],
    ['For any story world', 'CanonTracker now speaks to novelists, game, screen and series writers, and worldbuilders.'],
    ['MCP and API', 'MCP grows to 16 grounded read and propose tools with paging and limits; every API route answers bad input with 400.'],
    ['Canon page', 'A paged, filterable list and a readable relationship graph.'],
    ['Version re-check', 'A new version flags only the canon facts whose quote is gone or repeated.'],
    ['Quote matching', 'Quotes match across smart quotes, dashes, Markdown and line breaks; the stored quote keeps the source’s characters.'],
    ['Story time', 'Days before day 1 and day-only times.'],
    ['Books', 'The story bible and the manuscript as print PDF and EPUB.'],
    ['Entity types', 'Each project defines its own; game projects start with NPC, item, ability and quest.'],
    ['Editing and tags', 'Edit written and imported text documents as a new version (recording transcripts are kept as heard); tags on documents and Library rows.'],
    ['Add a fact', 'Sentence first, with who, where and when filled in from the text.'],
    ['Propose a change', 'A guided flow, with impact grouped by hop.'],
    ['Project pages', 'A searchable project list and a page per project.'],
  ] },
  { date: '2026-10-31', label: 'Day 5 · 31 Oct 2026', entries: [
    ['Conflict severity', 'Hard and soft conflicts.'],
    ['Export and share', 'Story bible export as Markdown, zip and PDF; read-only share links.'],
    ['Re-review tasks', 'Scenes an applied change touches become tasks.'],
    ['Images', 'Uploaded and generated image history, document covers.'],
    ['Command palette', 'Ctrl/Cmd+K search across canon, entities, documents and notes.'],
    ['Settings', 'Profile and password change.'],
    ['Brand', 'Logo, app icons, illustrations and social images.'],
    ['Duplicate candidates', 'Duplicates are caught by identity and precision across every status.'],
  ] },
  { date: '2026-10-30', label: 'Day 4 · 30 Oct 2026', entries: [
    ['First version', 'Import, AI candidates with quotes, human review, canon, conflict rules and change impact.'],
    ['Accounts and studios', 'Sign-up, studios, members with roles, invites and projects.'],
    ['Live AI', 'AI features call the model provider live, with every call recorded.'],
    ['Entity wiki', 'Pages, portraits, merges and mention cards.'],
    ['MCP server', 'Agent tokens, read tools and proposals that wait in Review.'],
    ['Write in the app', 'Documents, focus mode, facts and notes from selected text.'],
    ['Library', 'Uploads, folders, tags, reader search, version history and diff.'],
    ['First login', 'Getting started checklist, guided tour, the Lantern Row sample and a phone nav.'],
    ['Image generation', 'Portraits and covers drawn by AI.'],
  ] },
  { date: '2026-10-29', label: 'Day 3 · 29 Oct 2026', entries: [
    ['Spec review', 'The spec is reviewed and trimmed to what can ship by 4 Nov.'],
    ['Build starts', 'The first version takes shape: import with hashes and versions, AI candidates with verbatim quotes, review, canon (committed the next morning).'],
  ] },
  { date: '2026-10-27', label: 'Days 1–2 · 27–28 Oct 2026', entries: [
    ['The idea', 'One place where a story team’s canon lives: every fact cited to its source, a person deciding what becomes canon, and a change shown with what it touches before it ships.'],
    ['The spec', 'The product spec: human gate, verbatim citations, narrow conflict rules and change impact within two hops.'],
  ] },
]
</script>

<template>
  <div>
    <MarketingHero title="Changelog" lead="What shipped, day by day, from day one. CanonTracker was built during the Meta AI Developer Hackathon, 27 Oct–4 Nov 2026; the git history starts on day 4." />
    <div class="log">
      <section v-for="d in DAYS" :key="d.date" class="day" :aria-labelledby="`d-${d.date}`">
        <h2 :id="`d-${d.date}`"><time :datetime="d.date">{{ d.label }}</time></h2>
        <ul>
          <li v-for="[title, text] in d.entries" :key="title"><b>{{ title }}</b><span>{{ text }}</span></li>
        </ul>
      </section>
      <p class="src">Full history: <a :href="`${GITHUB}/commits/master`">commits on GitHub</a>.</p>
    </div>
  </div>
</template>

<style scoped>
.log { max-width: var(--mk-max); margin: 0 auto; padding: var(--s-6) var(--mk-pad) 0; border-top: 1px solid var(--line); }
.day { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: var(--s-5); padding-block: var(--s-5); border-bottom: 1px solid var(--line); }
.day h2 { font-size: var(--text-md); margin: 4px 0 0; position: sticky; top: 84px; align-self: start; }
.day ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }
.day li { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: var(--s-4); line-height: 1.55; }
.day li span { color: var(--muted); max-width: 70ch; }
.src { color: var(--muted); }
@media (max-width: 900px) {
  .day { grid-template-columns: minmax(0, 1fr); gap: var(--s-3); }
  .day h2 { position: static; }
  .day li { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
</style>
