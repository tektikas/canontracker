<script setup lang="ts">
definePageMeta({ layout: 'marketing' })
useMarketingSeo({ title: 'AI agents and MCP', description: 'What Story Bible’s AI does, which model runs it, what it may never do, and how your own agents connect through MCP.', image: 'og-agents', path: '/agents' })

const MAY = [
  'Read your documents and propose facts, each with a verbatim quote',
  'Give a second opinion on a candidate, with a reason',
  'Suggest a world-rule violation, labelled as an AI suggestion',
  'Answer questions from accepted canon, or say “unknown”',
  'Check a draft against canon and suggest fixes as text',
  'Research outside questions with linked, checked sources',
  'Transcribe recordings and dictation',
  'Draw portraits and covers when you ask',
]
const NEVER = [
  'Accept, reject or edit a fact: only a person can',
  'Make a fact canon without a quote found in its source',
  'Edit an imported document or a transcript',
  'Invent a source, a quote or a canon id; findings that cite one are dropped',
  'Fall back to stored output when a live call fails: the failure is shown',
  'Write notes into your team’s margins',
]
const TOOLS = [
  ['sb_list_projects', 'Projects the token can reach'],
  ['sb_get_context_pack', 'Canon about a topic, ready for a prompt'],
  ['sb_search_facts', 'Search canon facts'],
  ['sb_get_fact', 'One canon fact with its citations'],
  ['sb_get_entity', 'An entity’s canon, relationships, timeline and appearances'],
  ['sb_list_entities', 'Every wiki page'],
  ['sb_get_timeline', 'Events in a window of story time'],
  ['sb_ask', 'The same grounded answer as Ask'],
  ['sb_list_documents', 'Documents and versions'],
  ['sb_read_document', 'Any version, by lines or passages, paged'],
  ['sb_check_facts', 'Run the conflict rules on up to 20 proposed facts; stores nothing'],
  ['sb_list_conflicts', 'Open and decided conflicts'],
  ['sb_get_impact', 'The impact of a change proposal'],
  ['sb_list_recheck', 'Citations to re-check after a new version'],
  ['sb_list_tasks', 'Re-review tasks'],
  ['sb_propose_candidate', 'The only write: a pending candidate with a verbatim quote, for Review'],
]
const client = ref<'claude' | 'cursor' | 'other'>('claude')
const SNIPPETS = {
  claude: `claude mcp add --transport http story-bible ${SITE}/mcp \\\n  --header "Authorization: Bearer sb_…"`,
  cursor: JSON.stringify({ mcpServers: { 'story-bible': { url: `${SITE}/mcp`, headers: { Authorization: 'Bearer sb_…' } } } }, null, 2),
  other: `URL:        ${SITE}/mcp\nHeader:     Authorization: Bearer sb_…\nTransport:  Streamable HTTP (stateless)`,
}
const copied = ref(false)
async function copy() {
  try { await navigator.clipboard.writeText(SNIPPETS[client.value]); copied.value = true; setTimeout(() => (copied.value = false), 1600) }
  catch { copied.value = false }
}
</script>

<template>
  <div>
    <MarketingHero title="AI agents that read, check and propose" lead="Story Bible uses AI for the reading: finding facts, second opinions, continuity, research and transcripts. Every one of them proposes; none of them decides. Your own agents connect through MCP under the same rules." art="agents" art-alt="A brass lamp over an open ledger, a loose pencilled card waiting beside it." />

    <section class="block">
      <h2>The agents, and the model behind each</h2>
      <p class="intro">Language work runs on Muse Spark via the Meta Model API. Every call is recorded with its model, prompt version and result, and listed on the Agent activity page.</p>
      <ul class="agents">
        <li v-for="a in AGENTS" :key="a.name">
          <div class="agent-head">
            <UiIcon :name="a.icon" :size="20" class="agent-icon" />
            <h3>{{ a.name }}</h3>
            <span class="model">{{ a.model }}</span>
          </div>
          <p>{{ a.does }}</p>
          <p class="never">{{ a.never }}</p>
        </li>
        <li>
          <div class="agent-head">
            <UiIcon name="conflicts" :size="20" class="agent-icon" />
            <h3>Rule check</h3>
            <span class="model">Muse Spark</span>
          </div>
          <p>Reads accepted world rules and suggests facts that may break them, next to the deterministic conflict rules.</p>
          <p class="never">Shown as an AI suggestion, with its own label. A person confirms or dismisses it.</p>
        </li>
        <li>
          <div class="agent-head">
            <UiIcon name="image" :size="20" class="agent-icon" />
            <h3>Images</h3>
            <span class="model">Muse Image</span>
          </div>
          <p>Draws entity portraits and document covers when you ask, from a prompt drafted from canon that you can edit, in the project’s art style.</p>
          <p class="never">Nothing is applied until you pick an image. Portraits are editorial: never canon, never used by conflicts or impact.</p>
        </li>
      </ul>
    </section>

    <section class="block rules">
      <div>
        <h2>What the AI may do</h2>
        <ul class="may"><li v-for="m in MAY" :key="m">{{ m }}</li></ul>
      </div>
      <div>
        <h2>What it may never do</h2>
        <ul class="no"><li v-for="m in NEVER" :key="m">{{ m }}</li></ul>
      </div>
    </section>

    <section class="block">
      <MarketingFeature :section="{ title: 'A receipt for every AI run', text: 'Agent activity lists each run newest first: which agent, what it was about, the model and prompt version, every step with its tool, arguments, timing and tokens, and what people did with the result afterwards.', points: ['“How was this made?” on an answer opens its run', 'A draft’s continuity check is visible only to its author'], shot: { name: 'agent-activity', alt: 'Agent activity: AI runs with their agent, subject, model and outcome.' } }" />
    </section>

    <section id="mcp" class="block mcp">
      <div class="mcp-copy">
        <h2>Connect your own agents with MCP</h2>
        <p>Story Bible is an MCP server (Streamable HTTP). Create a token in Settings, under Agents &amp; API: it acts as you, in one project, with your current role. Tokens are stored as a hash, shown once and can be revoked.</p>
        <ul>
          <li>15 read tools for canon, entities, timeline, documents, conflicts, impact and tasks</li>
          <li>One write: <code>sb_propose_candidate</code>, editors and up, quote checked against the latest version; it lands in Review as an agent proposal</li>
          <li>Prompts: <code>brief-entity</code> and <code>continuity-check-scene</code></li>
          <li>120 tool calls a minute per token; large results are paged</li>
        </ul>
      </div>
      <div class="config">
        <UiTabs v-model="client" :items="[{ value: 'claude', label: 'Claude Code' }, { value: 'cursor', label: 'Cursor' }, { value: 'other', label: 'Other client' }]" />
        <pre class="code"><code>{{ SNIPPETS[client] }}</code></pre>
        <div class="copy-row">
          <span class="small faint">Replace <code>sb_…</code> with your token.</span>
          <UiButton size="sm" icon="copy" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</UiButton>
        </div>
      </div>
    </section>

    <section class="block">
      <h2>The tools</h2>
      <div class="table-wrap">
        <table class="tools">
          <thead><tr><th scope="col">Tool</th><th scope="col">What it returns</th></tr></thead>
          <tbody>
            <tr v-for="[name, text] in TOOLS" :key="name"><td><code>{{ name }}</code></td><td>{{ text }}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="small muted">Empty results say “unknown” or “no impact found”. Errors are JSON with a code such as <code>QUOTE_NOT_VERBATIM</code> or <code>RATE_LIMITED</code>.</p>
    </section>

    <section class="block">
      <MarketingFeature :section="{ title: 'Set up in the app', text: 'Settings, Agents & API shows the endpoint and a ready-made config for Muse Spark, Claude Code, Cursor or any other client, with your token filled in.', points: [], shot: { name: 'mcp', alt: 'Settings, Agents & API: create a token and copy a client config.' } }" flip />
    </section>

    <MarketingCta />
  </div>
</template>

<style scoped>
.block { max-width: var(--mk-max); margin: 0 auto; padding: 56px var(--mk-pad); border-top: 1px solid var(--line); }
.block > h2, .rules h2, .mcp h2 { font-size: var(--text-xl); letter-spacing: -0.02em; margin-bottom: var(--s-3); }
.intro { color: var(--muted); max-width: 66ch; font-size: 1rem; line-height: 1.6; margin-bottom: var(--s-6); }
.agents { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-4); }
.agents li { padding: var(--s-5); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); }
.agent-head { display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; margin-bottom: var(--s-3); }
.agent-head h3 { margin: 0; font-size: var(--text-lg); }
.agent-icon { width: 36px; height: 36px; padding: 8px; color: var(--accent); background: var(--accent-soft); border-radius: var(--r-md); box-sizing: border-box; }
.model { margin-left: auto; font-size: var(--text-sm); color: var(--muted); padding: 2px 8px; border: 1px solid var(--line-strong); border-radius: var(--r-sm); }
.agents p { margin: 0 0 var(--s-2); color: var(--muted); line-height: 1.55; }
.agents .never { color: var(--ink); margin: 0; padding-left: var(--s-3); border-left: 2px dashed var(--pencil); }

.rules { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-6); }
.rules ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
.rules li { position: relative; padding: var(--s-3) var(--s-3) var(--s-3) 40px; background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-md); line-height: 1.45; }
.may li::before { content: ''; position: absolute; left: 16px; top: 1.05em; width: 10px; height: 6px; border-left: 2px solid var(--good); border-bottom: 2px solid var(--good); transform: rotate(-45deg); }
.no li { border-style: dashed; }
.no li::before, .no li::after { content: ''; position: absolute; left: 14px; top: 1.3em; width: 14px; height: 2px; background: var(--bad); transform: rotate(45deg); }
.no li::after { transform: rotate(-45deg); }

.mcp { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: var(--s-6); align-items: start; }
.mcp-copy p { color: var(--muted); line-height: 1.6; font-size: 1rem; }
.mcp-copy ul { margin: 0; padding-left: 1.1em; display: grid; gap: var(--s-2); line-height: 1.5; }
.config { display: grid; gap: var(--s-3); min-width: 0; }
.code { margin: 0; padding: var(--s-4); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-md); font-family: var(--font-code); font-size: var(--text-sm); line-height: 1.6; overflow-x: auto; white-space: pre; min-height: 120px; }
.copy-row { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); flex-wrap: wrap; }

.tools { width: 100%; border-collapse: collapse; }
.tools th, .tools td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
.tools th { font-size: var(--text-sm); color: var(--muted); background: var(--surface); }
.tools td:first-child { white-space: nowrap; }
.block > .small { margin-top: var(--s-3); }

@media (max-width: 900px) {
  .agents, .rules, .mcp { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 720px) {
  .block { padding-block: var(--s-6); }
  .agents li { padding: var(--s-4); }
  .model { margin-left: 0; }
  .tools td:first-child { white-space: normal; word-break: break-all; }
}
</style>
