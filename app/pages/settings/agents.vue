<script setup lang="ts">
useHead({ title: 'Agents & API · Story Bible' })
const origin = useRequestURL().origin
const endpoint = `${origin}/mcp`
const { data, refresh } = await useFetch('/api/agent-tokens')
const active = computed(() => (data.value?.tokens ?? []).filter(t => !t.revoked_at))
const revoked = computed(() => (data.value?.tokens ?? []).filter(t => t.revoked_at))

const name = ref('')
// What the token may do, fixed at creation: propose (the default) or full ("acts as you", canon decisions included).
const level = ref<'propose' | 'full'>('propose')
const LEVELS = [
  { value: 'propose', label: 'Propose only', hint: 'Reads canon and sources, runs checks, proposes candidates and changes. People decide in the app.' },
  { value: 'full', label: 'Full access: acts as you', hint: 'Everything your role allows, canon decisions included. Marked “via agent” wherever it decides.' },
] as const
const busy = ref(false)
const error = ref('')
// The secret exists only in this response; it is kept in memory until the page is left.
const created = ref<{ id: string, name: string, level: string, secret: string }>()
async function create() {
  error.value = ''
  busy.value = true
  try {
    created.value = await $fetch('/api/agent-tokens', { method: 'POST', body: { name: name.value, level: level.value } })
    name.value = ''
    level.value = 'propose'
    await refresh()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

const revoking = ref('')
async function revoke(id: string) {
  try {
    await $fetch(`/api/agent-tokens/${id}`, { method: 'DELETE' })
    if (created.value?.id === id) created.value = undefined
    revoking.value = ''
    await refresh()
  } catch (e) {
    error.value = errorMessage(e)
  }
}

const copied = ref('')
const copyFailed = ref('')
async function copy(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    copyFailed.value = ''
    setTimeout(() => { if (copied.value === key) copied.value = '' }, 2000)
  } catch {
    copyFailed.value = key
  }
}

const client = ref<'muse' | 'claude' | 'cursor' | 'other'>('muse')
const secret = computed(() => created.value?.secret ?? '<your-token>')
const museScript = (token: string) => `// Muse Spark + Story Bible tools. Node 20+, no dependencies.
// Muse Spark calls function tools on the Meta Model API; this script relays each call to Story Bible's /mcp endpoint.
const MCP = '${endpoint}'
const TOKEN = '${token}'
const META_KEY = process.env.META_API_KEY // your Meta Model API key, never pasted into the file
const QUESTION = process.argv[2] || 'What do we know about the tide bell?'

async function rpc(method, params) {
  const r = await fetch(MCP, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer ' + TOKEN }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  return j.result
}
async function chat(messages, tools) {
  const r = await fetch('https://api.meta.ai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + META_KEY }, body: JSON.stringify({ model: 'muse-spark-1.3', messages, tools }) })
  if (!r.ok) throw new Error('Meta Model API ' + r.status + ': ' + await r.text())
  return (await r.json()).choices[0].message
}

const listed = (await rpc('tools/list', {})).tools
const tools = listed.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }))
const messages = [
  { role: 'system', content: 'Answer only from Story Bible canon. If a tool says unknown, say you do not know. Never invent facts, ids or quotes.' },
  { role: 'user', content: QUESTION },
]
for (let turn = 0; turn < 6; turn++) {
  const msg = await chat(messages, tools)
  messages.push(msg) // the full assistant message that holds tool_calls must stay in the list
  if (!msg.tool_calls?.length) { console.log(msg.content); process.exit(0) }
  for (const call of msg.tool_calls) {
    const out = await rpc('tools/call', { name: call.function.name, arguments: JSON.parse(call.function.arguments || '{}') })
    messages.push({ role: 'tool', tool_call_id: call.id, content: out.content.map(c => c.text).join('\\n') })
  }
}
console.error('Stopped after 6 tool rounds without an answer.')
process.exit(1)`
const snippets = computed(() => ({
  muse: { file: 'Save as muse-story-bible.mjs, then run: META_API_KEY=… node muse-story-bible.mjs "your question"', text: museScript(secret.value) },
  claude: { file: 'Run in your terminal', text: `claude mcp add --transport http story-bible ${endpoint} \\\n  --header "Authorization: Bearer ${secret.value}"` },
  cursor: { file: 'Add to .cursor/mcp.json', text: JSON.stringify({ mcpServers: { 'story-bible': { url: endpoint, headers: { Authorization: `Bearer ${secret.value}` } } } }, null, 2) },
  other: { file: 'Any MCP client with Streamable HTTP', text: `URL:     ${endpoint}\nHeader:  Authorization: Bearer ${secret.value}\nTransport: Streamable HTTP (stateless, JSON responses)` },
}))

const when = (iso: string | null) => (iso ? dateTime(iso) : '')
// Grouped as a narrative lead would hand out the work. Read and propose work with any token; the last group needs full access.
const TOOLS: [string, [string, string][]][] = [
  ['Read canon', [
    ['sb_get_entity', 'Brief on a character, place or item: canon facts with quotes, relationships, timeline, where it appears. Wiki text is marked “not canon”'],
    ['sb_get_context_pack', 'Approved facts about an entity or topic, with quotes and source ids'],
    ['sb_search_facts', 'Keyword search over canon'],
    ['sb_get_fact', 'One fact with every evidence quote'],
    ['sb_get_timeline', 'Canon in story order, by time window or entity (D-3650, D0, day-only)'],
    ['sb_ask', 'A question answered from canon, or “unknown”'],
  ]],
  ['Read sources', [
    ['sb_list_documents', 'Documents by folder, kind or tag, with versions and re-check counts'],
    ['sb_read_document', 'Source text by line range or passage, any version, in pages'],
    ['sb_list_entities', 'Wiki pages by type'],
  ]],
  ['Check', [
    ['sb_check_facts', 'Continuity check: the conflicts new facts would raise against canon. Stores nothing'],
    ['sb_list_conflicts', 'Possible conflicts to judge'],
    ['sb_get_impact', 'What a fact or change would touch, up to 2 hops'],
    ['sb_list_recheck', 'Canon citations to re-check after a new version'],
    ['sb_list_tasks', 'Open re-review tasks from applied changes'],
  ]],
  ['Read the rest of the project', [
    ['sb_search', 'Search canon, pages, documents and notes'],
    ['sb_review list', 'The review queue, with the AI critic’s advice'],
    ['sb_document history / diff', 'Versions and what changed between them'],
    ['sb_note, sb_library, sb_images, sb_draft', 'Notes, folders and tags, images, your drafts (list and read)'],
    ['sb_conversation, sb_research', 'Team conversations in Ask and research notes'],
    ['sb_export, sb_share list', 'The story bible as Markdown or JSON; share links'],
    ['sb_audit, sb_metrics, sb_agent_runs', 'Audit trail, project numbers and measurements, AI activity'],
    ['sb_project, sb_team', 'Project settings, entity types, members'],
  ]],
  ['Propose and run checks (editors and up)', [
    ['sb_propose_candidate, sb_review add', 'Adds a pending candidate quoting a source; waits for a person in Review'],
    ['sb_change propose / analyze', 'Proposes a canon change and shows its impact; canon is untouched'],
    ['sb_document extract, sb_conflict scan', 'Runs extraction or the conflict rules; results wait for a person'],
    ['sb_continuity, sb_research, sb_review critic', 'AI checks and research; advice and notes, never canon'],
  ]],
  ['Decide and edit (full access only)', [
    ['sb_review accept / reject', 'Canon decisions in Review, as you, marked “via agent”'],
    ['sb_change decide / revert, sb_conflict decide', 'Apply or reject changes, judge conflicts'],
    ['sb_document import / write, sb_draft', 'Import files (text or Word), save new versions'],
    ['sb_entity, sb_note, sb_library, sb_images', 'Pages, merges, notes, folders and tags, images'],
    ['sb_recheck, sb_task, sb_share, sb_conversation post', 'Re-check citations, tasks, share links, post in Ask'],
    ['sb_project update, sb_team', 'Settings and team (admins and owners only)'],
  ]],
]
const ASKS = [
  'Brief me on our lead character. Keep the team’s wiki notes apart from canon.',
  'Continuity-check the scene I just imported against canon.',
  'If she reaches the harbour at 21:15 on Day 2, does that clash with anything?',
  'Which canon facts need a re-check after the last import?',
  'Propose the rule stated in that scene as a candidate, quoting it exactly.',
  'With a full-access token: file the new character from this scene, accept it, and tell me what the change touches.',
]
</script>

<template>
  <div v-if="data" class="stack" style="gap: var(--s-5)">
    <p class="muted intro">Connect your AI agent (Muse Spark, Claude Code, Cursor, any MCP client) to <b>{{ data.project.name }}</b>. It can read approved canon and the source documents with citations, run continuity checks, and propose candidates. <b>Nothing an agent proposes becomes canon until a person accepts it.</b> A full-access token can also decide, as you, and is marked “via agent” wherever it does.</p>

    <UiPanel title="API tokens" description="A token belongs to you, works for this project only and has your role. Revoke it any time.">
      <form class="token-form" novalidate @submit.prevent="create">
        <UiField label="Token name" :error="error" hint="Name the agent or machine, e.g. “Claude Code on Mira’s laptop”.">
          <input v-model="name" type="text" maxlength="60" placeholder="Claude Code on my laptop">
        </UiField>
        <fieldset class="levels">
          <legend class="small">What it may do <span class="faint">(can’t be changed later)</span></legend>
          <label v-for="l in LEVELS" :key="l.value" class="level" :class="{ on: level === l.value }">
            <input v-model="level" type="radio" name="level" :value="l.value">
            <span><b>{{ l.label }}</b><span class="small muted">{{ l.hint }}</span></span>
          </label>
        </fieldset>
        <p v-if="level === 'full'" class="notice warn" role="note">This agent can accept and reject candidates, apply changes, edit pages, notes and the Library, and post for you: anything your role allows. Every action is logged as yours, via this token. Only give it to an agent you trust; you can revoke it any time.</p>
        <UiButton type="submit" variant="primary" icon="plus" :loading="busy" :disabled="!name.trim()">Create token</UiButton>
      </form>
      <p v-if="data.role === 'viewer'" class="notice info token-note">You are a viewer: a token can read canon but can’t propose or decide, whatever its access.</p>

      <div v-if="created" class="created" role="status">
        <div class="small"><b>Copy “{{ created.name }}” now.</b> It is shown once and stored hashed; we can’t show it again. Access: {{ created.level === 'full' ? 'full, acts as you' : 'propose only' }}.</div>
        <div class="link-row">
          <input :value="created.secret" type="text" readonly class="mono" aria-label="New API token" @focus="($event.target as HTMLInputElement).select()">
          <UiButton :variant="copied === 'token' ? 'good' : 'primary'" :icon="copied === 'token' ? 'check' : 'copy'" @click="copy(created.secret, 'token')">{{ copied === 'token' ? 'Copied' : 'Copy token' }}</UiButton>
        </div>
        <p v-if="copyFailed === 'token'" class="small field-error" role="alert">Couldn’t copy. Select the token and press Ctrl+C.</p>
        <p class="small muted">The connect guide below now has this token filled in.</p>
      </div>

      <ul v-if="active.length" class="tokens">
        <li v-for="t in active" :key="t.id" class="token">
          <div class="token-main">
            <strong>{{ t.name }}</strong>
            <span class="mono faint">{{ t.prefix }}…</span>
            <UiBadge :tone="t.level === 'full' ? 'warn' : 'neutral'" :title="LEVELS.find(l => l.value === t.level)?.hint">{{ t.level === 'full' ? 'Full access' : 'Propose only' }}</UiBadge>
          </div>
          <span class="small muted">Created {{ when(t.created_at) }} · {{ t.last_used_at ? `last used ${when(t.last_used_at)}` : 'never used' }}</span>
          <div class="row token-actions">
            <template v-if="revoking === t.id">
              <span class="small">Revoke? It stops working now.</span>
              <UiButton size="sm" variant="danger" @click="revoke(t.id)">Revoke</UiButton>
              <UiButton size="sm" variant="ghost" @click="revoking = ''">Keep</UiButton>
            </template>
            <UiButton v-else size="sm" variant="ghost" @click="revoking = t.id">Revoke</UiButton>
          </div>
        </li>
      </ul>
      <p v-else class="small faint empty">No active tokens yet.</p>
      <details v-if="revoked.length" class="revoked">
        <summary class="small muted">{{ revoked.length }} revoked</summary>
        <ul class="tokens">
          <li v-for="t in revoked" :key="t.id" class="token dim">
            <div class="token-main"><strong>{{ t.name }}</strong><span class="mono faint">{{ t.prefix }}…</span><UiBadge>{{ t.level === 'full' ? 'Full access' : 'Propose only' }}</UiBadge><UiBadge tone="bad">Revoked</UiBadge></div>
            <span class="small muted">Revoked {{ when(t.revoked_at) }}</span>
          </li>
        </ul>
      </details>
    </UiPanel>

    <UiPanel title="Connect your agent" description="Paste one of these into your client. The endpoint is Streamable HTTP; the token goes in the Authorization header. Muse Spark uses a small script instead (see below).">
      <UiTabs v-model="client" :items="[{ value: 'muse', label: 'Muse Spark (Meta)' }, { value: 'claude', label: 'Claude Code' }, { value: 'cursor', label: 'Cursor' }, { value: 'other', label: 'Other client' }]" />
      <p v-if="client === 'muse'" class="small muse-note">
        <b>Meta’s docs describe function tools for Muse Spark and no remote MCP connector,</b> so this script bridges the two:
        Muse Spark decides which Story Bible tool to call, the script runs it against this project’s <code>/mcp</code> endpoint with your token, and passes the answer back. Same project and role checks as any MCP client; anything it proposes waits for a person in Review.
        Docs: <a href="https://dev.meta.ai/docs/cookbook/tool-function-calling" target="_blank" rel="noopener">tool calling</a>. The script has not been run against a live Meta key yet (billing is off).
      </p>
      <div class="snippet">
        <div class="snippet-head">
          <span class="small muted">{{ snippets[client].file }}</span>
          <UiButton size="sm" :variant="copied === 'snip' ? 'good' : 'secondary'" :icon="copied === 'snip' ? 'check' : 'copy'" @click="copy(snippets[client].text, 'snip')">{{ copied === 'snip' ? 'Copied' : 'Copy' }}</UiButton>
        </div>
        <pre class="mono" tabindex="0">{{ snippets[client].text }}</pre>
      </div>
      <p v-if="!created" class="small faint">Replace <code>&lt;your-token&gt;</code> with a token from above.</p>
      <p v-if="copyFailed === 'snip'" class="small field-error" role="alert">Couldn’t copy. Select the text and press Ctrl+C.</p>

      <h3 class="tools-h">What your agent can do</h3>
      <template v-for="[group, tools] in TOOLS" :key="group">
        <h4 class="tools-group small">{{ group }}</h4>
        <dl class="tools">
          <template v-for="[n, d] in tools" :key="n"><dt class="mono">{{ n }}</dt><dd>{{ d }}</dd></template>
        </dl>
      </template>
      <h3 class="tools-h">Try asking</h3>
      <ul class="asks">
        <li v-for="q in ASKS" :key="q">“{{ q }}”</li>
      </ul>
      <p class="small muted">Clients that support MCP prompts also get two ready-made tasks: <b>Brief me on an entity</b> and <b>Continuity-check a scene</b>.</p>
      <p class="small muted">If canon has nothing, the agent is told “unknown” and never invents sources. Candidates it proposes must quote an imported document word for word, and show up in Review marked “Agent proposal”. What a full-access token decides shows “by you via agent” in Review, Canon, Conflicts, Changes and the audit trail. Each token can make 120 tool calls a minute; AI tools also count toward your own hourly limits.</p>
      <p class="small faint">Not available to agents: your account, studios, API tokens, accepting invites, loading a demo (it replaces the project), audio uploads and dictation, and file downloads (portraits, images, audio, EPUB). Use the app for those.</p>
    </UiPanel>
  </div>
</template>

<style scoped>
.intro { margin: 0; max-width: 66ch; }
.token-form { display: grid; gap: var(--s-3); max-width: 460px; justify-items: start; }
.token-form :deep(.field) { width: 100%; }
.token-note { margin-top: var(--s-3); }
.levels { display: grid; gap: var(--s-2); width: 100%; margin: 0; padding: 0; border: 0; }
.levels legend { margin-bottom: var(--s-2); padding: 0; font-weight: 600; }
.level { display: flex; gap: var(--s-3); align-items: flex-start; padding: var(--s-3); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--canvas); cursor: pointer; }
.level > span { display: grid; gap: 2px; }
.level input { margin-top: 3px; accent-color: var(--accent); }
.level.on { border-color: var(--accent); background: var(--accent-soft); }
.level:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.created { display: grid; gap: var(--s-2); margin-top: var(--s-4); padding: var(--s-4); border: 1px solid color-mix(in srgb, var(--good) 35%, var(--line)); border-radius: var(--r-md); background: var(--good-soft); }
.created p { margin: 0; }
.link-row { display: flex; gap: var(--s-2); }
.link-row input { flex: 1; min-width: 0; font-size: var(--text-sm); }
.tokens { list-style: none; margin: var(--s-4) 0 0; padding: 0; border-top: 1px solid var(--line); }
.token { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px var(--s-4); align-items: center; padding: var(--s-3) 0; border-bottom: 1px solid var(--line); }
.token-main { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; grid-column: 1; }
.token > .small { grid-column: 1; }
.token-actions { grid-column: 2; grid-row: 1 / span 2; justify-content: flex-end; }
.token.dim { opacity: 0.75; }
.empty { margin: var(--s-4) 0 0; }
.revoked { margin-top: var(--s-3); }
.revoked summary { cursor: pointer; }
.muse-note { margin: var(--s-4) 0 0; padding: var(--s-3); border: 1px dashed var(--line-strong); border-radius: var(--r-md); color: var(--muted); max-width: 76ch; }
.snippet { margin: var(--s-4) 0 var(--s-3); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--sunken); }
.snippet-head { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); padding: 6px 8px 6px 12px; border-bottom: 1px solid var(--line); }
.snippet pre { margin: 0; padding: var(--s-3) var(--s-4); overflow-x: auto; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; }
.tools-h { margin: var(--s-5) 0 var(--s-2); font-size: var(--text-md); }
.tools { display: grid; grid-template-columns: 18rem 1fr; gap: var(--s-2) var(--s-4); margin: 0 0 var(--s-4); }
.tools dt { color: var(--ink); overflow-wrap: anywhere; }
.tools dd { margin: 0; color: var(--muted); font-size: var(--text-sm); }
.tools-group { margin: var(--s-3) 0 var(--s-2); color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.asks { margin: 0 0 var(--s-3); padding-left: var(--s-5); display: grid; gap: var(--s-1); color: var(--ink); }
@media (max-width: 720px) {
  .link-row { flex-direction: column; }
  .token { grid-template-columns: 1fr; }
  .token-actions { grid-column: 1; grid-row: auto; justify-content: flex-start; margin-top: var(--s-2); }
  .tools { grid-template-columns: 1fr; gap: 0; }
  .tools dd { margin-bottom: var(--s-2); }
}
</style>
