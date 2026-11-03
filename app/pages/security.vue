<script setup lang="ts">
definePageMeta({ layout: 'marketing' })
useMarketingSeo({ title: 'Security and trust', description: 'How Story Bible keeps canon human-approved and source-cited, keeps projects apart, records every decision, stores your files and uses the Meta Model API.', image: 'og-security', path: '/security' })

const GROUPS = [
  {
    title: 'The human gate',
    items: [
      'The AI only creates candidates. A fact becomes canon only through an explicit decision by a person, recorded with their name.',
      'Bulk accept works on the list you can see: if a candidate changed since you loaded it, it is skipped.',
      'Agents connected through MCP use a token with a level fixed at creation. Propose (the default) reads, proposes and runs AI checks; nothing it does becomes canon. Full access acts as its owner within their role, and every decision it makes is shown as “via agent” with the token’s name.',
      'An agent can never create a token, change the team or see invite links, and goes through the same checks and limits as the app.',
    ],
  },
  {
    title: 'Evidence rules',
    items: [
      'Every canon fact has at least one citation whose quote appears word for word in its passage. The check runs again at accept time.',
      'Quotes are matched across typography (smart quotes, dashes, line breaks) but stored as the source’s exact characters.',
      'With no evidence, an answer is “unknown”. Story Bible never invents a source id or a quote.',
      'When a document gets a new version, citations whose quote is gone are flagged for re-check instead of silently moving.',
    ],
  },
  {
    title: 'Sources stay as they are',
    items: [
      'Imported documents are never modified. Edits create a new version; old versions stay readable.',
      'A Word upload is kept as the original file. Recording transcripts are never edited.',
      'Superseded facts are kept with their history, not deleted.',
    ],
  },
  {
    title: 'Project isolation and roles',
    items: [
      'Every piece of content belongs to one project. A single guard on every content request checks that you are a member of the project’s studio and what your role allows.',
      'Owners, admins, editors and viewers. Viewers read everything and take part in Ask, including research and voice input; they cannot change canon or documents. Only owners change owners, and a studio always keeps one owner.',
      'Pages in other studios answer “not found”, not “forbidden”.',
      'Invite links carry a role and an expiry, work once and can be revoked.',
    ],
  },
  {
    title: 'Audit trail',
    items: [
      'Imports, decisions, merges, changes, exports, share links and agent proposals are written to an append-only audit log with who and when. A change made through an agent token also records that token.',
      'Every AI call is recorded with its model, prompt version, input reference and result, and shown on Agent activity.',
      'Users are never deleted, so names on past decisions survive a member leaving.',
    ],
  },
  {
    title: 'Accounts and access',
    items: [
      'Sessions are a sealed, httpOnly cookie that holds only your user id and current project. Passwords are hashed with scrypt.',
      'Failed log-ins are throttled per email and per address; sign-ups are throttled too.',
      'API tokens and share links are stored only as a hash and shown once. Share links are read-only, can expire and never show names, notes, candidates or the audit log.',
      'Not built yet: single sign-on and password reset by email. Ask your studio owner to reset access.',
    ],
  },
  {
    title: 'Where data lives',
    items: [
      'Story Bible stores your data in one SQLite database on the server that runs it. Uploaded originals, recordings and portraits are files next to it, served only through routes that check your access.',
      'Self-host it and your server sends data only to the AI model provider you configure and, for Research, to the public pages it opens.',
      'Research only opens public https pages, with size and time limits; links with embedded passwords are dropped.',
    ],
  },
  {
    title: 'Model provider',
    items: [
      'AI features run on Muse Spark via the Meta Model API; voice uses Muse Voice Transcribe and images use Muse Image, from the same provider.',
      'What is sent: the document text being read, candidates with their passages, your question with the canon it needs, audio being transcribed. The API key stays on the server and never reaches the browser.',
      'When a model call fails (billing, a key problem, a timeout, bad output), the error is shown and recorded. Nothing is filled in.',
    ],
  },
]
</script>

<template>
  <div>
    <MarketingHero title="Security and trust" lead="Story Bible is built so a model can’t write your canon and a person can always see where a fact came from. These are the rules the code enforces today, and what isn’t built yet." art="security" art-alt="A leather ledger fastened with a brass lock and a wax seal, its key beside it." />
    <div class="body">
      <nav class="toc" aria-label="On this page">
        <a v-for="(g, i) in GROUPS" :key="g.title" :href="`#s${i}`">{{ g.title }}</a>
      </nav>
      <div class="groups">
        <section v-for="(g, i) in GROUPS" :id="`s${i}`" :key="g.title" class="group">
          <h2>{{ g.title }}</h2>
          <ul>
            <li v-for="it in g.items" :key="it" :class="{ planned: it.startsWith('Not built yet') }">{{ it }}</li>
          </ul>
        </section>
        <p class="report">Found a security problem? Write to <a :href="CONTACT">info@tektik.ai</a>. The source is open on <a :href="GITHUB">GitHub</a>.</p>
      </div>
    </div>
    <MarketingCta />
  </div>
</template>

<style scoped>
.body { max-width: var(--mk-max); margin: 0 auto; padding: var(--s-7) var(--mk-pad) 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: var(--s-7); }
.toc { position: sticky; top: 84px; align-self: start; display: grid; gap: 2px; }
.toc a { padding: 6px 10px; border-left: 2px solid var(--line); color: var(--muted); text-decoration: none; }
.toc a:hover { color: var(--ink); border-left-color: var(--accent); }
.groups { display: grid; gap: var(--s-6); }
.group { scroll-margin-top: 84px; }
.group h2 { font-size: var(--text-xl); letter-spacing: -0.02em; margin-bottom: var(--s-3); }
.group ul { margin: 0; padding: 0; list-style: none; display: grid; border-top: 1px solid var(--line); }
.group li { padding: var(--s-3) 0 var(--s-3) var(--s-5); border-bottom: 1px solid var(--line); line-height: 1.6; max-width: 76ch; position: relative; }
.group li::before { content: ''; position: absolute; left: 2px; top: 1.15em; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.group li.planned { color: var(--muted); }
.group li.planned::before { background: none; border: 1.5px dashed var(--pencil); }
.report { margin: 0; padding: var(--s-4); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); }
@media (max-width: 900px) {
  .body { grid-template-columns: minmax(0, 1fr); gap: var(--s-5); }
  .toc { position: static; grid-template-columns: 1fr 1fr; }
}
@media (max-width: 520px) { .toc { grid-template-columns: minmax(0, 1fr); } }
</style>
