<script setup lang="ts">
const { data: canon, refresh: refreshCanon } = await useFetch('/api/facts', { query: { status: 'canon' } })
const { data: superseded } = await useFetch('/api/facts', { query: { status: 'superseded' } })
const route = useRoute()
const editor = computed(() => canEdit(useMe().value))
const router = useRouter()
const fill = useFillAction()

type Tab = 'facts' | 'graph' | 'entities' | 'timeline' | 'superseded'
const tab = ref<Tab>(route.query.entity ? 'entities' : 'facts')
const filter = ref('')
const entity = ref<string | null>(typeof route.query.entity === 'string' ? route.query.entity : null)
const KINDS = ['rule', 'character', 'relationship', 'event', 'location', 'claim']

// Re-check after a source changed (server/utils/recheck.ts): ?recheck=1 lists exactly the facts whose quote is gone from the
// newer version; the ones whose quote reads the same wait for one confirmation.
const recheckOnly = computed({
  get: () => route.query.recheck === '1',
  set: v => router.replace({ query: { ...route.query, recheck: v ? '1' : undefined } }),
})
const outdated = computed(() => (canon.value ?? []).filter(f => f.recheck === 'outdated'))
const unchanged = computed(() => (canon.value ?? []).filter(f => f.recheck === 'unchanged'))
// Confirm re-pins every unchanged citation of these facts, so the button counts citations, not facts.
const unchangedCitations = computed(() => unchanged.value.reduce((n, f) => n + f.evidence.filter((e: Ev) => e.recheck === 'unchanged').length, 0))
watch(recheckOnly, (v) => { if (v) tab.value = 'facts' }, { immediate: true })
const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return (recheckOnly.value && tab.value === 'facts' ? outdated.value : canon.value ?? []).filter(f => !q || `${f.statement} ${f.subject} ${f.object ?? ''}`.toLowerCase().includes(q))
})
type Ev = NonNullable<typeof canon.value>[number]['evidence'][number]
// Each outdated citation is decided on its own: its source, its diff, its Keep. Keeping one source says nothing about another.
const outdatedEvs = (f: { evidence: Ev[] }) => f.evidence.filter(e => e.recheck === 'outdated')
const busy = ref('')
const done = ref('')
const failed = ref('')
// confirm: fact ids (every unchanged citation of each); keep: one citation's evidence id.
async function recheck(action: 'confirm' | 'keep', ids: string[]) {
  busy.value = action === 'keep' ? ids[0]! : 'confirm'
  done.value = failed.value = ''
  try {
    const r = await $fetch('/api/facts/recheck', { method: 'POST', body: action === 'confirm' ? { action, fact_ids: ids } : { action, evidence_ids: ids } })
    done.value = action === 'confirm' ? `${counted(r.done.length, 'fact now cites', 'facts now cite')} the newer version.` : 'Kept as it is. A later version of the source will ask again.'
    await Promise.all([refreshCanon(), refreshNuxtData('stats')])
  } catch (e) {
    failed.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}
async function keep(f: { evidence: Ev[] }, ev: Ev) {
  const others = outdatedEvs(f).length - 1
  if (!(await askConfirm({
    title: 'Keep this citation as it is?',
    body: `It keeps citing ${ev.document_title} v${ev.document_version}, where its quote still stands (${quoteLost(ev.recheck_count ?? 0, ev.latest_version).toLowerCase()}). Nothing in canon changes; the audit records your decision. A later version of the source asks again.${others ? ` This fact has ${counted(others, 'other outdated citation')}; ${others === 1 ? 'it stays' : 'they stay'} outdated until you decide ${others === 1 ? 'it' : 'them'} too.` : ''}`,
    confirm: 'Keep as is',
  }))) return
  recheck('keep', [ev.id])
}
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
// Every canon name has a wiki page (filed automatically); aliases resolve too.
const lookup = useEntityLookup()
const wiki = computed(() => (entity.value ? lookup.value.byName.get(normName(entity.value)) : undefined))
const tabs = computed(() => [
  { value: 'facts' as Tab, label: 'Facts', count: canon.value?.length ?? 0 },
  { value: 'graph' as Tab, label: 'Graph' },
  // Names canon uses; the Entities section counts wiki pages, which include pages made by hand.
  { value: 'entities' as Tab, label: 'Names', count: entities.value.length },
  { value: 'timeline' as Tab, label: 'Timeline' },
  { value: 'superseded' as Tab, label: 'Superseded', count: superseded.value?.length ?? 0 },
])
// The palette links to #fact-<id>: show Facts unfiltered, scroll to that fact and mark it (:target is not updated by client-side navigation).
const target = computed(() => (route.hash.startsWith('#fact-') ? route.hash.slice(6) : ''))
async function jump() {
  if (!target.value) return
  tab.value = 'facts'
  filter.value = ''
  await nextTick()
  document.getElementById(`fact-${target.value}`)?.scrollIntoView({ block: 'center' })
}
onMounted(jump)
watch(target, jump)
// Lineage: the version that replaced each superseded fact (canon or a later superseded version).
const successor = (id: string) => [...(canon.value ?? []), ...(superseded.value ?? [])].find(f => f.supersedes_id === id)
</script>

<template>
  <UiPageHeader title="Canon" :description="`${canon?.some(f => f.origin === 'sample') ? 'Facts a person accepted, plus the sample’s preloaded canon (marked).' : 'Only facts a person accepted.'} Every fact links to the exact passage it came from.`">
    <template #actions><UiButton icon="link" to="/export">Export &amp; share</UiButton></template>
  </UiPageHeader>

  <UiTabs v-model="tab" :items="tabs" />

  <div v-if="tab === 'facts' || tab === 'timeline'" class="filter">
    <input v-model="filter" type="search" placeholder="Filter by character, place, word…" aria-label="Filter canon">
    <UiButton v-if="filter" @click="filter = ''">Clear</UiButton>
    <button v-if="tab === 'facts' && (outdated.length || unchanged.length || recheckOnly)" type="button" class="recheck-toggle" :class="{ on: recheckOnly, bad: outdated.length }" :aria-pressed="recheckOnly" @click="recheckOnly = !recheckOnly">
      <UiIcon name="history" :size="14" />Needs re-check <b>{{ outdated.length }}</b>
    </button>
  </div>

  <div v-if="tab === 'facts' && recheckOnly" class="recheck-head">
    <p v-if="done" class="notice info" role="status">{{ done }}</p>
    <p v-if="failed" class="notice bad" role="alert">{{ failed }}</p>
    <div v-if="unchanged.length" class="notice warn unchanged">
      <UiIcon name="check" :size="16" />
      <div class="stack-tight">
        <span><b>{{ counted(unchanged.length, 'fact cites', 'facts cite') }} an older version, but {{ unchanged.length === 1 ? 'its quote reads' : 'their quotes read' }} the same in the newer one.</b> Confirm to cite the newer version.</span>
        <details class="small">
          <summary>Show {{ unchanged.length === 1 ? 'it' : 'them' }}</summary>
          <ul><li v-for="f in unchanged" :key="f.id"><NuxtLink :to="`/canon#fact-${f.id}`">{{ f.statement }}</NuxtLink></li></ul>
        </details>
      </div>
      <UiButton v-if="editor" size="sm" variant="primary" :loading="busy === 'confirm'" :disabled="!!busy" @click="recheck('confirm', unchanged.map(f => f.id))">
        Confirm {{ counted(unchangedCitations, 'unchanged citation') }}
      </UiButton>
    </div>
    <p v-if="outdated.length" class="small muted">{{ counted(outdated.length, 'fact rests', 'facts rest') }} on words a newer version of the source no longer has. For each: see what changed, then propose a change or keep it as it is.</p>
  </div>

  <UiEmptyState v-if="!canon?.length && tab !== 'superseded'" title="No canon yet" icon="canon">
    Canon holds only facts a person accepted. Accept candidates in Review, or select words in a source and add them as a fact.
    <template #actions><UiButton variant="primary" :icon="fill.icon" :to="fill.to">{{ fill.label }}</UiButton></template>
  </UiEmptyState>

  <template v-else-if="tab === 'facts'">
    <UiEmptyState v-if="recheckOnly && !outdated.length" title="No outdated evidence" icon="check">
      Every canon quote still appears in the latest version of its source.
      <template #actions><UiButton @click="recheckOnly = false">Show all canon</UiButton></template>
    </UiEmptyState>
    <p v-else-if="!groups.length" class="muted">No canon fact matches “{{ filter }}”.</p>
    <section v-for="g in groups" :key="g.kind" class="kind">
      <h2>{{ g.kind }}s</h2>
      <div class="stack">
        <UiPanel v-for="f in g.facts" :id="`fact-${f.id}`" :key="f.id" class="stack" :class="{ target: f.id === target }">
          <FactSummary :fact="f" sources />
          <template v-if="f.recheck === 'outdated'">
            <ul class="outdated-evs" :aria-label="`Outdated evidence of this fact`">
              <li v-for="ev in outdatedEvs(f)" :key="ev.id">
                <span class="small"><UiIcon name="file" :size="14" /><b>{{ ev.document_title }}</b><span class="faint">v{{ ev.document_version }}</span><span class="bad-text">{{ quoteLost(ev.recheck_count ?? 0, ev.latest_version) }}</span></span>
                <div class="row">
                  <UiButton size="sm" icon="history" :to="`/documents/${ev.latest_document_id}/history?from=${ev.document_id}&to=${ev.latest_document_id}`">See what changed</UiButton>
                  <UiButton v-if="editor" size="sm" variant="ghost" :loading="busy === ev.id" :disabled="!!busy" @click="keep(f, ev)">Keep as is</UiButton>
                </div>
              </li>
            </ul>
            <div v-if="editor"><UiButton size="sm" icon="changes" :to="`/changes?target=${f.id}`">Propose change…</UiButton></div>
          </template>
          <div v-else-if="editor"><UiButton size="sm" :to="`/changes?target=${f.id}`">Propose change…</UiButton></div>
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
    <div v-if="entity && wiki" class="wiki-link"><UiButton size="sm" icon="entities" :to="`/entities/${wiki.id}`">Open {{ entity }}’s page</UiButton></div>
    <EntityCard v-if="entity" class="profile" :name="entity" :facts="canon!" @select="showEntity" />
  </UiPanel>

  <UiPanel v-else-if="tab === 'timeline'" title="Story timeline" description="By story time, one lane per character. Day 1 starts at 00:00; earlier days are D0, D-1, ….">
    <StoryTimeline v-if="filtered.some(f => f.t_from != null || f.t_to != null)" :facts="filtered" :all-facts="canon!" />
    <p v-else class="muted">No timed canon facts{{ filter ? ' match this filter' : '' }}.</p>
  </UiPanel>

  <section v-else class="stack">
    <UiEmptyState v-if="!superseded?.length" title="No superseded facts">
      Accepted change proposals keep the old version here. A fact whose evidence went out of date stays in canon until someone proposes a change for it.
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
.filter { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-bottom: var(--s-4); }
.filter input { flex: 1 1 240px; max-width: 420px; }
.recheck-toggle { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 var(--s-3); border: 1px solid var(--line-strong); border-radius: var(--r-md); background: var(--raised); color: var(--ink); font: 500 var(--text-sm) var(--font-ui); cursor: pointer; }
.recheck-toggle:hover { background: var(--sunken); }
.recheck-toggle.bad { border-color: color-mix(in srgb, var(--bad) 45%, transparent); color: var(--bad); }
.recheck-toggle.on { background: var(--bad-soft); border-color: var(--bad); color: var(--bad); }
.recheck-toggle.on:not(.bad) { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.recheck-head { display: grid; gap: var(--s-3); margin-bottom: var(--s-5); }
.recheck-head > * { margin: 0; }
.unchanged { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: flex-start; }
.unchanged svg { flex: none; margin-top: 2px; }
.stack-tight { display: grid; gap: 4px; flex: 1 1 260px; min-width: 0; }
.unchanged ul { margin: 6px 0 0; padding-left: 18px; }
.outdated-evs { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
.outdated-evs li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s-2); padding: var(--s-2) var(--s-3); border: 1px solid color-mix(in srgb, var(--bad) 35%, transparent); border-radius: var(--r-md); background: var(--bad-soft); }
.outdated-evs li > span { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; min-width: 0; }
.bad-text { color: var(--bad); font-weight: 600; }
@media (max-width: 720px) { .recheck-toggle { min-height: 44px; } }
.target { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); scroll-margin-top: 72px; }
.kind { margin-bottom: var(--s-5); }
.kind h2 { text-transform: capitalize; }
.picker { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-bottom: var(--s-5); }
.pick { min-height: 34px; padding: 0 var(--s-3); border: 1px solid var(--line-strong); border-radius: var(--r-md); background: var(--raised); color: var(--ink); font: inherit; font-weight: 500; cursor: pointer; }
.pick:hover { background: var(--sunken); }
.pick.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.pick.on .faint { color: inherit; }
.lineage { margin: 0; padding-left: var(--s-3); border-left: 3px solid var(--line-strong); }
.story { font-family: var(--font-story); color: var(--ink); }
.wiki-link { margin-bottom: var(--s-3); }
.profile { border-top: 1px solid var(--line); padding-top: var(--s-5); }
</style>
