<script setup lang="ts">
definePageMeta({ layout: 'marketing' })
useMarketingSeo({ title: 'Changelog', description: 'What shipped in Story Bible, day by day, from the git history.', path: '/changelog' })

// Taken from the merge commits on master (git log --merges); one line per shipped change, newest first.
const DAYS: { date: string, label: string, entries: [string, string][] }[] = [
  { date: '2026-11-03', label: '3 Nov 2026', entries: [
    ['MCP parity', 'Agents can do almost everything people do in a project through MCP (team changes, sample loads, audio uploads and downloads stay in the app): 38 tools. Tokens are propose-only or full access (acts as you), and decisions made by an agent show “via agent”.'],
    ['Open source', 'Story Bible is licensed under AGPL-3.0.'],
    ['Plain AI labels', 'The product says “AI” everywhere; which model ran is on Agent activity and Metrics.'],
  ] },
  { date: '2026-11-02', label: '2 Nov 2026', entries: [
    ['Continuity check', 'Check a draft or a passage against canon; every finding quotes your text and cites real canon. New Agent activity page lists every AI run.'],
    ['AI critic', 'A confirmed second opinion on each candidate in Review: keep, reject or needs edit, with a reason.'],
    ['Word import', '.docx files with tracked changes, footnotes and tables; Word comments become notes.'],
    ['Voice', 'Recordings become timed sources, script vs recording checks, and dictation in the editor and Ask.'],
    ['Research', 'Real-world questions answered with checked web sources and calculators; notes never become canon on their own.'],
    ['Team conversations in Ask', 'Shared conversations with a canon or research switch, follow-up questions and a chat drawer on every page.'],
    ['A writer’s palette', 'Linen, paper and walnut ink in light; warm wood in dark.'],
    ['The Ashbell Pass', 'A third sample: a 28-document game story with planted contradictions.'],
    ['For any story world', 'Story Bible now speaks to novelists, game, screen and series writers, and worldbuilders.'],
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
  { date: '2026-10-31', label: '31 Oct 2026', entries: [
    ['Conflict severity', 'Hard and soft conflicts.'],
    ['Export and share', 'Story bible export as Markdown, zip and PDF; read-only share links.'],
    ['Re-review tasks', 'Scenes an applied change touches become tasks.'],
    ['Images', 'Uploaded and generated image history, document covers.'],
    ['Command palette', 'Ctrl/Cmd+K search across canon, entities, documents and notes.'],
    ['Settings', 'Profile and password change.'],
    ['Brand', 'Logo, app icons, illustrations and social images.'],
    ['Duplicate candidates', 'Duplicates are caught by identity and precision across every status.'],
  ] },
  { date: '2026-10-30', label: '30 Oct 2026', entries: [
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
]
</script>

<template>
  <div>
    <MarketingHero title="Changelog" lead="What shipped, day by day, taken from the project’s git history. Story Bible was built in the open for the Meta AI Developer Hackathon." />
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
