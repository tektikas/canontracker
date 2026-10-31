<script setup lang="ts">
// Re-review tasks: the scenes an applied change may have affected, as work someone owns. Editorial; never canon.
useHead({ title: 'Tasks · Story Bible' })
const route = useRoute()
const router = useRouter()
const me = useMe()
const { data: tasks, refresh } = await useFetch('/api/tasks', { default: () => [] })
const { data: team } = await useFetch('/api/team')
const members = computed(() => team.value?.members ?? [])

type Tab = 'open' | 'mine' | 'done' | 'all'
const TABS: Tab[] = ['open', 'mine', 'done', 'all']
const tab = computed<Tab>({
  get: () => (TABS.includes(route.query.show as Tab) ? route.query.show as Tab : 'open'),
  set: v => router.replace({ query: { ...route.query, show: v === 'open' ? undefined : v } }),
})
const param = (k: string) => computed({
  get: () => (typeof route.query[k] === 'string' ? route.query[k] as string : ''),
  set: v => router.replace({ query: { ...route.query, [k]: v || undefined } }),
})
const change = param('change')
const doc = param('doc')

const isOpen = (t: { status: string }) => t.status === 'open' || t.status === 'in_progress'
const mine = (t: { assignee_id: string | null }) => t.assignee_id === me.value?.user?.id
const changes = computed(() => [...new Map(tasks.value.map(t => [t.change_id, t.change_statement])).entries()])
const docs = computed(() => [...new Map(tasks.value.map(t => [t.filename, t.document_title])).entries()])
const scoped = computed(() => tasks.value.filter(t => (!change.value || t.change_id === change.value) && (!doc.value || t.filename === doc.value)))
const match: Record<Tab, (t: any) => boolean> = { open: isOpen, mine: t => mine(t) && isOpen(t), done: t => !isOpen(t), all: () => true }
const shown = computed(() => scoped.value.filter(match[tab.value]))
const tabs = computed(() => [
  { value: 'open' as Tab, label: 'Open', count: scoped.value.filter(match.open).length },
  { value: 'mine' as Tab, label: 'Mine', count: scoped.value.filter(match.mine).length },
  { value: 'done' as Tab, label: 'Closed', count: scoped.value.filter(match.done).length },
  { value: 'all' as Tab, label: 'All', count: scoped.value.length },
])
const EMPTY: Record<Tab, string> = {
  open: 'Nothing to re-review right now.',
  mine: 'Nothing is assigned to you.',
  done: 'Nothing closed yet.',
  all: 'No tasks in this view.',
}
async function changed() {
  await refresh()
  refreshNuxtData('stats')
}
</script>

<template>
  <UiPageHeader title="Tasks">
    When a canon change is applied, every scene it may affect becomes a re-review task here. Tasks are for your team; they never become canon.
  </UiPageHeader>

  <UiPanel v-if="!tasks.length">
    <UiEmptyState title="No re-review tasks yet" icon="tasks">
      Apply a canon change that has scenes in its impact list and each of those scenes lands here.
      <template #actions><UiButton to="/changes" icon="changes">Open changes</UiButton></template>
    </UiEmptyState>
  </UiPanel>

  <template v-else>
    <div class="filters">
      <UiTabs v-model="tab" :items="tabs" />
      <div class="selects">
        <label><span class="sr-only">Change</span>
          <select v-model="change">
            <option value="">All changes</option>
            <option v-for="[id, s] in changes" :key="id" :value="id">{{ s.length > 60 ? `${s.slice(0, 60)}…` : s }}</option>
          </select>
        </label>
        <label><span class="sr-only">Document</span>
          <select v-model="doc">
            <option value="">All documents</option>
            <option v-for="[f, title] in docs" :key="f" :value="f">{{ title }}</option>
          </select>
        </label>
      </div>
    </div>
    <p v-if="!shown.length" class="muted none">{{ EMPTY[tab] }}</p>
    <ul v-else class="list">
      <li v-for="t in shown" :key="t.id"><TaskCard :task="t" :members="members" @changed="changed" /></li>
    </ul>
  </template>
</template>

<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: end; justify-content: space-between; margin-bottom: var(--s-4); border-bottom: 1px solid var(--line); }
.filters .tabs-wrap { margin-bottom: -1px; }
.filters :deep(.tabs) { border-bottom: 0; }
.selects { display: flex; flex-wrap: wrap; gap: var(--s-2); padding-bottom: var(--s-2); }
.selects select { min-width: 200px; max-width: 280px; }
.none { margin: 0; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); max-width: 760px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 720px) {
  .selects, .selects label, .selects select { width: 100%; max-width: none; }
}
</style>
