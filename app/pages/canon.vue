<script setup lang="ts">
const { data: canon } = await useFetch('/api/facts', { query: { status: 'canon' } })
const { data: superseded } = await useFetch('/api/facts', { query: { status: 'superseded' } })
const route = useRoute()
const router = useRouter()

type Tab = 'facts' | 'graph' | 'entities' | 'timeline' | 'superseded'
const tab = ref<Tab>(route.query.entity ? 'entities' : 'facts')
const filter = ref('')
const entity = ref<string | null>(typeof route.query.entity === 'string' ? route.query.entity : null)
const KINDS = ['rule', 'character', 'relationship', 'event', 'location', 'claim']

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return (canon.value ?? []).filter(f => !q || `${f.statement} ${f.subject} ${f.object ?? ''}`.toLowerCase().includes(q))
})
const groups = computed(() => KINDS.map(kind => ({ kind, facts: filtered.value.filter(f => f.kind === kind) })).filter(g => g.facts.length))
const entities = computed(() => {
  const counts = new Map<string, number>()
  for (const f of canon.value ?? []) for (const e of [f.subject, f.object]) if (e) counts.set(e, (counts.get(e) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
})
function showEntity(name: string) {
  entity.value = name
  tab.value = 'entities'
  router.replace({ query: { entity: name } })
}
const tabs = computed(() => [
  { value: 'facts' as Tab, label: 'Facts', count: canon.value?.length ?? 0 },
  { value: 'graph' as Tab, label: 'Graph' },
  { value: 'entities' as Tab, label: 'Entities', count: entities.value.length },
  { value: 'timeline' as Tab, label: 'Timeline' },
  { value: 'superseded' as Tab, label: 'Superseded', count: superseded.value?.length ?? 0 },
])
// Lineage: the version that replaced each superseded fact (canon or a later superseded version).
const successor = (id: string) => [...(canon.value ?? []), ...(superseded.value ?? [])].find(f => f.supersedes_id === id)
</script>

<template>
  <UiPageHeader title="Canon" description="Only facts a person accepted. Every fact links to the exact passage it came from." />

  <div class="tabwrap"><UiTabs v-model="tab" :items="tabs" /></div>

  <div v-if="tab === 'facts' || tab === 'timeline'" class="filter">
    <input v-model="filter" type="search" placeholder="Filter by character, place, word…" aria-label="Filter canon">
    <UiButton v-if="filter" @click="filter = ''">Clear</UiButton>
  </div>

  <UiEmptyState v-if="!canon?.length && tab !== 'superseded'" title="No canon yet">
    <template #actions><UiButton variant="primary" to="/review">Review candidates</UiButton></template>
  </UiEmptyState>

  <template v-else-if="tab === 'facts'">
    <p v-if="!groups.length" class="muted">No canon fact matches “{{ filter }}”.</p>
    <section v-for="g in groups" :key="g.kind" class="kind">
      <h2>{{ g.kind }}s</h2>
      <div class="stack">
        <UiPanel v-for="f in g.facts" :key="f.id" class="stack">
          <FactSummary :fact="f" sources />
          <div><UiButton size="sm" :to="`/changes?target=${f.id}`">Propose change…</UiButton></div>
        </UiPanel>
      </div>
    </section>
  </template>

  <UiPanel v-else-if="tab === 'graph'">
    <EntityGraph :facts="canon!" :selected="entity ?? undefined" @select="showEntity" />
  </UiPanel>

  <UiPanel v-else-if="tab === 'entities'" description="Characters, places and objects named in canon. Pick one to see everything known about it.">
    <div class="picker">
      <button v-for="[name, n] in entities" :key="name" type="button" class="pick" :class="{ on: name === entity }" :aria-pressed="name === entity" @click="showEntity(name)">
        {{ name }} <span class="faint">{{ n }}</span>
      </button>
    </div>
    <EntityCard v-if="entity" class="profile" :name="entity" :facts="canon!" @select="showEntity" />
  </UiPanel>

  <UiPanel v-else-if="tab === 'timeline'" title="Story timeline" description="By story time, one lane per character. Day 1 starts at 00:00.">
    <StoryTimeline v-if="filtered.some(f => f.t_from != null || f.t_to != null)" :facts="filtered" />
    <p v-else class="muted">No timed canon facts{{ filter ? ' match this filter' : '' }}.</p>
  </UiPanel>

  <section v-else class="stack">
    <UiEmptyState v-if="!superseded?.length" title="No superseded facts">
      Accepted change proposals keep the old version here.
    </UiEmptyState>
    <UiPanel v-for="f in superseded" :key="f.id" class="stack">
      <UiBadge>Superseded v{{ f.version }}</UiBadge>
      <FactSummary :fact="f" sources />
      <p v-if="successor(f.id)" class="small muted lineage">
        Replaced by v{{ successor(f.id)!.version }} ({{ successor(f.id)!.status }}): <span class="story">{{ successor(f.id)!.statement }}</span>
      </p>
    </UiPanel>
  </section>
</template>

<style scoped>
.tabwrap :deep(.tabs) { flex-wrap: wrap; overflow-x: visible; }
.filter { display: flex; gap: var(--s-2); margin-bottom: var(--s-4); max-width: 420px; }
.kind { margin-bottom: var(--s-5); }
.kind h2 { text-transform: capitalize; }
.picker { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-bottom: var(--s-5); }
.pick { min-height: 34px; padding: 0 var(--s-3); border: 1px solid var(--line-strong); border-radius: var(--r-md); background: var(--raised); color: var(--ink); font: inherit; font-weight: 500; cursor: pointer; }
.pick:hover { background: var(--sunken); }
.pick.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.pick.on .faint { color: inherit; }
.lineage { margin: 0; padding-left: var(--s-3); border-left: 3px solid var(--line-strong); }
.story { font-family: var(--font-story); color: var(--ink); }
.profile { border-top: 1px solid var(--line); padding-top: var(--s-5); }
</style>
