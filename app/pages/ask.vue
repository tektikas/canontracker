<script setup lang="ts">
// Ask: the project's conversations. Left, every conversation on the project (anyone on the team can read and post in any);
// right, the open one (?c=<id>; none = a new conversation, started by its first message). The list refreshes every 5 s
// while the tab is visible, so a teammate's new conversation or message shows up without a reload.
useHead({ title: 'Ask · CanonTracker' })
const route = useRoute()
const router = useRouter()
const me = useMe()
const editor = computed(() => canEdit(me.value))
const chat = useChat()
useChatDock('ask', () => true)

const q = ref('')
const { data: list, refresh } = await useFetch('/api/conversations', { query: computed(() => ({ q: q.value.trim() })), default: () => [] })
let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => { poll = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 5000) })
onBeforeUnmount(() => clearInterval(poll))

// ?c=new opens an empty conversation (on phones the list is the start screen, so "new" needs its own address).
const current = computed<string | null>({
  get: () => (typeof route.query.c === 'string' && route.query.c !== 'new' ? route.query.c : null),
  set: id => router.replace({ query: { c: id ?? 'new' } }),
})
const showingChat = computed(() => !!route.query.c)
function startNew() {
  router.push({ query: { c: 'new' } })
  chat.value.tick++
}
const thread = ref<{ conversation: { id: string, title: string, created_by_name: string, created_at: string, can_delete?: boolean } | null, reload: () => unknown, send: (t: string) => unknown }>()
const conversation = computed(() => (current.value ? thread.value?.conversation ?? null : null))

// Rename (editors and up).
const renaming = ref(false)
const newTitle = ref('')
const renameError = ref('')
function startRename() {
  newTitle.value = conversation.value?.title ?? ''
  renameError.value = ''
  renaming.value = true
  nextTick(() => document.querySelector<HTMLInputElement>('.rename input')?.select())
}
async function rename() {
  try {
    await $fetch(`/api/conversations/${current.value}`, { method: 'PATCH', body: { title: newTitle.value } })
    renaming.value = false
    await Promise.all([thread.value?.reload(), refresh()])
  } catch (e) {
    renameError.value = errorMessage(e)
  }
}
watch(current, () => { renaming.value = false })

// Delete (whoever started it, or a studio admin; the server decides and says can_delete).
const deleteError = ref('')
async function remove() {
  const c = conversation.value
  if (!c || !(await askConfirm({ title: `Delete “${c.title}”?`, body: 'The conversation and every message in it are removed for the whole team. Canon, research notes and continuity reports stay.', confirm: 'Delete conversation', danger: true }))) return
  try {
    await $fetch(`/api/conversations/${c.id}`, { method: 'DELETE' })
    deleteError.value = ''
    await router.replace({ query: {} })
    await refresh()
  } catch (e) {
    deleteError.value = errorMessage(e)
  }
}
watch(current, () => { deleteError.value = '' })

// Starter questions: the demo's own, or ones about the project's most-cited pages.
const DEMO_EXAMPLES = ['Why can\'t Leya remember an hour of Day 1?', 'Where is Arin at 22:00 on Day 1?', 'What did the harbor master eat on Day 3?']
const ASHBELL_EXAMPLES = ['Who rings the Ashbell at dusk?', 'Where was she at dusk?', 'What is Corin\'s favourite song?']
const { data: docs } = await useFetch('/api/documents')
const { data: entities } = await useEntityList()
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const examples = computed(() => {
  if (docs.value?.some(d => d.filename === 'lore-chord-stone.md')) return DEMO_EXAMPLES
  if (docs.value?.some(d => d.filename === 'lore-the-ashbell.md')) return ASHBELL_EXAMPLES
  const cited = entities.value.filter(e => e.facts > 0).sort((a, b) => b.facts - a.facts)
  const who = cited.find(e => e.kind === 'character')
  const where = cited.find(e => e.kind === 'location')
  const top = cited.find(e => e !== who && e !== where)
  return [who && `Where is ${who.name}?`, where && `Who has been to ${placePhrase(where.name)}?`, top && `What do we know about ${top.name}?`].filter((x): x is string => !!x)
})
function tryExample(ex: string) {
  chat.value.mode = 'canon'
  thread.value?.send(ex)
}
</script>

<template>
  <div class="ask" :class="{ 'showing-chat': showingChat }">
    <aside class="convs" aria-label="Conversations">
      <div class="convs-head">
        <h1>Ask</h1>
        <UiButton variant="primary" size="sm" icon="plus" @click="startNew">New</UiButton>
      </div>
      <input v-model="q" type="search" class="conv-search" placeholder="Search conversations" aria-label="Search conversations">
      <p v-if="!list.length" class="small muted none">{{ q.trim() ? 'No conversation matches.' : 'No conversations yet. Ask the first question; the whole team will see it.' }}</p>
      <ul v-else class="conv-list">
        <li v-for="c in list" :key="c.id">
          <NuxtLink :to="{ query: { c: c.id } }" class="conv" :aria-current="c.id === current ? 'page' : undefined">
            <UiIcon :name="c.mode === 'research' ? 'research' : 'canon'" :size="16" class="conv-mode" :class="c.mode" :label="c.mode === 'research' ? 'Research' : 'Canon'" />
            <span class="conv-text">
              <span class="conv-title">{{ c.title }}</span>
              <span class="conv-meta small">{{ c.people || c.created_by_name }} · <ClientOnly>{{ timeAgo(c.updated_at) }}<template #fallback>{{ shortDate(c.updated_at) }}</template></ClientOnly></span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </aside>

    <section class="chat-col" :aria-label="conversation?.title ?? 'New conversation'">
      <header class="chat-head">
        <NuxtLink to="/ask" class="back small"><UiIcon name="arrow" :size="14" class="flip" />Conversations</NuxtLink>
        <form v-if="renaming" class="rename" @submit.prevent="rename">
          <input v-model="newTitle" type="text" maxlength="120" aria-label="Conversation title" required @keydown.esc="renaming = false">
          <UiButton type="submit" size="sm" variant="primary">Save</UiButton>
          <UiButton size="sm" variant="ghost" @click="renaming = false">Cancel</UiButton>
          <p v-if="renameError" class="field-error" role="alert">{{ renameError }}</p>
        </form>
        <template v-else>
          <div class="chat-title">
            <h2>{{ conversation?.title ?? 'New conversation' }}</h2>
            <p class="small muted">
              <template v-if="conversation">Started by {{ conversation.created_by_name }}, {{ shortDate(conversation.created_at) }} · everyone on {{ me?.current?.project.name ?? 'the project' }} can read and reply</template>
              <template v-else>Everyone on {{ me?.current?.project.name ?? 'the project' }} will see this conversation.</template>
            </p>
          </div>
          <UiButton v-if="conversation && editor" size="sm" variant="ghost" icon="review" @click="startRename">Rename</UiButton>
          <UiButton v-if="conversation?.can_delete" size="sm" variant="ghost" icon="trash" @click="remove">Delete</UiButton>
          <p v-if="deleteError" class="field-error" role="alert">{{ deleteError }}</p>
        </template>
      </header>

      <ChatThread ref="thread" v-model:conv="current" @changed="refresh">
        <template #empty>
          <div class="starter">
            <div class="modes-explained">
              <div class="explain canon"><b><UiIcon name="canon" :size="14" />Canon</b><span class="small muted">Answers only from accepted canon and cites the sources. No evidence means “unknown”. Fast.</span></div>
              <div class="explain research"><b><UiIcon name="research" :size="14" />Research</b><span class="small muted">Real-world questions: history, science, procedure. Outside sources, slower, never added to canon.</span></div>
            </div>
            <template v-if="stats && !stats.canon">
              <p class="small muted">This project has no accepted canon yet, so Canon answers “unknown” for now. Research works without it.</p>
            </template>
            <template v-else-if="examples.length">
              <p class="small muted">Try one of these:</p>
              <div class="examples">
                <button v-for="ex in examples" :key="ex" type="button" class="example" @click="tryExample(ex)">{{ ex }}</button>
              </div>
            </template>
          </div>
        </template>
      </ChatThread>
    </section>
  </div>
</template>

<style scoped>
.ask { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: var(--s-5); align-items: start; }
.convs { position: sticky; top: var(--s-4); display: grid; gap: var(--s-3); align-content: start; max-height: calc(100dvh - 2 * var(--s-4)); overflow-y: auto; padding-right: 2px; }
.convs-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); }
.convs-head h1 { margin: 0; font-size: var(--text-2xl); }
.conv-search { width: 100%; }
.none { margin: 0; }
.conv-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.conv { display: flex; gap: var(--s-2); align-items: flex-start; padding: 8px 10px; border-radius: var(--r-md); color: var(--ink); text-decoration: none; }
.conv:hover { background: var(--sunken); }
.conv[aria-current] { background: var(--raised); box-shadow: 0 0 0 1px var(--line-strong); }
.conv-mode { flex: none; margin-top: 2px; color: var(--accent); }
.conv-mode.research { color: var(--research); }
.conv-text { display: grid; min-width: 0; gap: 1px; }
.conv-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conv[aria-current] .conv-title { font-weight: 600; }
.conv-meta { color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-col { display: grid; gap: var(--s-3); min-width: 0; }
.chat-head { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); align-items: flex-start; justify-content: space-between; padding-bottom: var(--s-3); border-bottom: 1px solid var(--line); }
.chat-title { min-width: 0; flex: 1 1 300px; }
.chat-title h2 { margin: 0; font-size: var(--text-lg); overflow-wrap: anywhere; }
.chat-title p { margin: 2px 0 0; }
.back { display: none; align-items: center; gap: 4px; flex-basis: 100%; color: var(--muted); }
.flip { transform: scaleX(-1); }
.rename { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; flex: 1; }
.rename input { flex: 1 1 240px; }
.rename .field-error { flex-basis: 100%; margin: 0; }
.starter { display: grid; gap: var(--s-3); padding: var(--s-4) 0; }
.starter p { margin: 0; }
.modes-explained { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--s-3); }
.explain { display: grid; gap: 4px; padding: var(--s-3); border: 1px solid var(--line); border-left-width: 4px; border-radius: var(--r-lg); background: var(--raised); }
.explain b { display: inline-flex; align-items: center; gap: 6px; }
.explain.canon { border-left-color: var(--accent); }
.explain.canon b { color: var(--accent); }
.explain.research { border-left-color: var(--research); }
.explain.research b { color: var(--research); }
.examples { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.example { font: inherit; font-size: var(--text-sm); color: var(--muted); background: var(--sunken); border: 1px solid var(--line); border-radius: var(--r-md); padding: 6px 10px; min-height: 34px; cursor: pointer; text-align: left; }
.example:hover { color: var(--ink); border-color: var(--line-strong); }
@media (max-width: 900px) {
  .ask { grid-template-columns: minmax(0, 1fr); }
  .convs { position: static; max-height: none; overflow: visible; }
  .ask.showing-chat .convs { display: none; }
  .ask:not(.showing-chat) .chat-col { display: none; }
  .back { display: inline-flex; }
  .conv { min-height: 52px; padding: 10px; }
}
</style>
