<script setup lang="ts">
useHead({ title: 'Agents & API · Story Bible' })
const origin = useRequestURL().origin
const endpoint = `${origin}/mcp`
const { data, refresh } = await useFetch('/api/agent-tokens')
const active = computed(() => (data.value?.tokens ?? []).filter(t => !t.revoked_at))
const revoked = computed(() => (data.value?.tokens ?? []).filter(t => t.revoked_at))

const name = ref('')
const busy = ref(false)
const error = ref('')
// The secret exists only in this response; it is kept in memory until the page is left.
const created = ref<{ id: string, name: string, secret: string }>()
async function create() {
  error.value = ''
  busy.value = true
  try {
    created.value = await $fetch('/api/agent-tokens', { method: 'POST', body: { name: name.value } })
    name.value = ''
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

const client = ref<'claude' | 'cursor' | 'other'>('claude')
const secret = computed(() => created.value?.secret ?? '<your-token>')
const snippets = computed(() => ({
  claude: { file: 'Run in your terminal', text: `claude mcp add --transport http story-bible ${endpoint} \\\n  --header "Authorization: Bearer ${secret.value}"` },
  cursor: { file: 'Add to .cursor/mcp.json', text: JSON.stringify({ mcpServers: { 'story-bible': { url: endpoint, headers: { Authorization: `Bearer ${secret.value}` } } } }, null, 2) },
  other: { file: 'Any MCP client with Streamable HTTP', text: `URL:     ${endpoint}\nHeader:  Authorization: Bearer ${secret.value}\nTransport: Streamable HTTP (stateless, JSON responses)` },
}))

const when = (iso: string | null) => (iso ? dateTime(iso) : '')
const TOOLS = [
  ['sb_get_context_pack', 'Approved facts about an entity or topic, with quotes and source ids'],
  ['sb_search_facts', 'Keyword search over canon'],
  ['sb_get_fact', 'One fact with every evidence quote'],
  ['sb_list_conflicts', 'Possible conflicts to judge'],
  ['sb_get_impact', 'What a fact or change would touch, up to 2 hops'],
  ['sb_propose_candidate', 'Adds a pending candidate for human review. The only write.'],
  ['sb_list_projects', 'The project this token is bound to, and your role'],
]
</script>

<template>
  <div v-if="data" class="stack" style="gap: var(--s-5)">
    <p class="muted intro">Connect your AI agent (Claude Code, Cursor, any MCP client) to <b>{{ data.project.name }}</b>. It can read approved canon with sources, check conflicts and impact, and propose candidates. <b>Nothing an agent proposes becomes canon until a person accepts it in Review.</b></p>

    <UiPanel title="API tokens" description="A token belongs to you, works for this project only and has your role. Revoke it any time.">
      <form class="token-form" novalidate @submit.prevent="create">
        <UiField label="Token name" :error="error" hint="Name the agent or machine, e.g. “Claude Code on Mira’s laptop”.">
          <input v-model="name" type="text" maxlength="60" placeholder="Claude Code on my laptop">
        </UiField>
        <UiButton type="submit" variant="primary" icon="plus" :loading="busy" :disabled="!name.trim()">Create token</UiButton>
      </form>
      <p v-if="data.role === 'viewer'" class="notice info token-note">You are a viewer: this token can read canon but can’t propose candidates.</p>

      <div v-if="created" class="created" role="status">
        <div class="small"><b>Copy “{{ created.name }}” now.</b> It is shown once and stored hashed; we can’t show it again.</div>
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
            <div class="token-main"><strong>{{ t.name }}</strong><span class="mono faint">{{ t.prefix }}…</span><UiBadge tone="bad">Revoked</UiBadge></div>
            <span class="small muted">Revoked {{ when(t.revoked_at) }}</span>
          </li>
        </ul>
      </details>
    </UiPanel>

    <UiPanel title="Connect your agent" description="Paste one of these into your client. The endpoint is Streamable HTTP; the token goes in the Authorization header.">
      <UiTabs v-model="client" :items="[{ value: 'claude', label: 'Claude Code' }, { value: 'cursor', label: 'Cursor' }, { value: 'other', label: 'Other client' }]" />
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
      <dl class="tools">
        <template v-for="[n, d] in TOOLS" :key="n"><dt class="mono">{{ n }}</dt><dd>{{ d }}</dd></template>
      </dl>
      <p class="small muted">If canon has nothing, the agent is told “unknown” and never invents sources. Candidates it proposes must quote an imported document word for word, and show up in Review marked “Agent proposal”.</p>
    </UiPanel>
  </div>
</template>

<style scoped>
.intro { margin: 0; max-width: 66ch; }
.token-form { display: grid; gap: var(--s-3); max-width: 460px; justify-items: start; }
.token-form :deep(.field) { width: 100%; }
.token-note { margin-top: var(--s-3); }
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
.snippet { margin: var(--s-4) 0 var(--s-3); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--sunken); }
.snippet-head { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); padding: 6px 8px 6px 12px; border-bottom: 1px solid var(--line); }
.snippet pre { margin: 0; padding: var(--s-3) var(--s-4); overflow-x: auto; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; }
.tools-h { margin: var(--s-5) 0 var(--s-2); font-size: var(--text-md); }
.tools { display: grid; grid-template-columns: max-content 1fr; gap: var(--s-2) var(--s-4); margin: 0 0 var(--s-4); }
.tools dt { color: var(--ink); }
.tools dd { margin: 0; color: var(--muted); font-size: var(--text-sm); }
@media (max-width: 720px) {
  .link-row { flex-direction: column; }
  .token { grid-template-columns: 1fr; }
  .token-actions { grid-column: 1; grid-row: auto; justify-content: flex-start; margin-top: var(--s-2); }
  .tools { grid-template-columns: 1fr; gap: 0; }
  .tools dd { margin-bottom: var(--s-2); }
}
</style>
