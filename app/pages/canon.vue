<script setup lang="ts">
const { data: canon, refresh: refreshCanon } = await useFetch('/api/facts', { query: { status: 'canon' } })
const { data: superseded } = await useFetch('/api/facts', { query: { status: 'superseded' } })
const route = useRoute()
const editor = computed(() => canEdit(useMe().value))
const router = useRouter()
const fill = useFillAction()

// Names live on Entities now; an old ?entity= link opens the graph focused on that entity.
type Tab = 'facts' | 'graph' | 'timeline' | 'superseded'
const tab = ref<Tab>(route.query.entity ? 'graph' : 'facts')
const filter = ref('')
const entity = typeof route.query.entity === 'string' ? route.query.entity : undefined
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
const matches = (f: { statement: string, subject: string, object: string | null }) => {
  const q = filter.value.trim().toLowerCase()
  return !q || `${f.statement} ${f.subject} ${f.object ?? ''}`.toLowerCase().includes(q)
}
const timelineFacts = computed(() => (canon.value ?? []).filter(matches))

// Facts list: one line per fact (expand for its evidence), filtered, grouped and paged so a big canon never scrolls forever.
type Fact = NonNullable<typeof canon.value>[number]
type Group = 'kind' | 'entity' | 'document'
const groupBy = ref<Group>('kind')
const kindF = ref('')
const docF = ref('')
const originF = ref<'' | 'people' | 'sample'>('')
const hasSample = computed(() => (canon.value ?? []).some(f => f.origin === 'sample'))
// A fact citing several documents is listed once: under the filtered document when there is one, else its first source,
// and the row names how many more it cites.
const docsOf = (f: Fact) => [...new Set(f.evidence.map((e: Ev) => e.document_title))]
const docOf = (f: Fact) => (docF.value && docsOf(f).includes(docF.value) ? docF.value : docsOf(f)[0] ?? 'No source')
const otherDocs = (f: Fact) => docsOf(f).filter(d => d !== docOf(f))
const docs = computed(() => [...new Set((canon.value ?? []).flatMap(f => f.evidence.map((e: Ev) => e.document_title)))].sort())
const filtering = computed(() => !!(filter.value || kindF.value || docF.value || originF.value))
function clearFilters() {
  filter.value = kindF.value = docF.value = originF.value = ''
}
const filtered = computed(() => (recheckOnly.value ? outdated.value : canon.value ?? []).filter(f => matches(f)
  && (!kindF.value || f.kind === kindF.value)
  && (!docF.value || f.evidence.some((e: Ev) => e.document_title === docF.value))
  && (!originF.value || (originF.value === 'sample') === (f.origin === 'sample'))))
const keyOf = (f: Fact) => (groupBy.value === 'kind' ? f.kind : groupBy.value === 'entity' ? f.subject : docOf(f))
const kindName = (k: string) => `${k[0]!.toUpperCase()}${k.slice(1)}s`
const labelOf = (k: string) => (groupBy.value === 'kind' ? kindName(k) : k)
const sorted = computed(() => {
  const rank = (k: string) => (groupBy.value === 'kind' ? String(KINDS.indexOf(k)).padStart(2, '0') : k.toLowerCase())
  return filtered.value.map((f, i) => ({ f, i, k: rank(keyOf(f)) })).sort((a, b) => a.k.localeCompare(b.k) || a.i - b.i).map(x => x.f)
})
const totals = computed(() => sorted.value.reduce((m, f) => m.set(keyOf(f), (m.get(keyOf(f)) ?? 0) + 1), new Map<string, number>()))
const PAGE = 50
const page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(sorted.value.length / PAGE)))
watch([filter, kindF, docF, originF, groupBy, recheckOnly], () => { page.value = 1 })
// The page's facts in runs of one group each; a group cut by a page break shows its header again on the next page.
const pageGroups = computed(() => {
  const out: { key: string, facts: Fact[] }[] = []
  for (const f of sorted.value.slice((page.value - 1) * PAGE, page.value * PAGE)) {
    const k = keyOf(f)
    if (out.at(-1)?.key !== k) out.push({ key: k, facts: [] })
    out.at(-1)!.facts.push(f)
  }
  return out
})
const range = computed(() => `${(page.value - 1) * PAGE + 1}–${Math.min(page.value * PAGE, sorted.value.length)} of ${sorted.value.length}`)
function goPage(n: number) {
  page.value = n
  nextTick(() => document.getElementById('canon-list')?.scrollIntoView({ block: 'start' }))
}
const open = ref(new Set<string>())
const toggle = (id: string) => { open.value.has(id) ? open.value.delete(id) : open.value.add(id) }
// Re-check mode opens every outdated fact, so each citation's actions are in view.
watch(recheckOnly, (v) => { if (v) for (const f of outdated.value) open.value.add(f.id) }, { immediate: true })
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
const tabs = computed(() => [
  { value: 'facts' as Tab, label: 'Facts', count: canon.value?.length ?? 0 },
  { value: 'graph' as Tab, label: 'Graph' },
  { value: 'timeline' as Tab, label: 'Timeline' },
  { value: 'superseded' as Tab, label: 'Superseded', count: superseded.value?.length ?? 0 },
])
// The palette links to #fact-<id>: show Facts unfiltered, scroll to that fact and mark it (:target is not updated by client-side navigation).
const target = computed(() => (route.hash.startsWith('#fact-') ? route.hash.slice(6) : ''))
async function jump() {
  if (!target.value) return
  tab.value = 'facts'
  clearFilters()
  await nextTick() // let the filter watcher reset the page first
  const i = sorted.value.findIndex(f => f.id === target.value)
  if (i < 0) return
  page.value = Math.floor(i / PAGE) + 1
  open.value.add(target.value)
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

  <div v-if="(tab === 'facts' || tab === 'timeline') && canon?.length" class="filter">
    <input v-model="filter" type="search" placeholder="Search by character, place, word…" aria-label="Search canon">
    <template v-if="tab === 'facts'">
      <select v-model="kindF" aria-label="Fact kind">
        <option value="">All kinds</option>
        <option v-for="k in KINDS" :key="k" :value="k">{{ kindName(k) }}</option>
      </select>
      <select v-if="docs.length > 1" v-model="docF" aria-label="Source document">
        <option value="">All documents</option>
        <option v-for="d in docs" :key="d" :value="d">{{ d }}</option>
      </select>
      <select v-if="hasSample" v-model="originF" aria-label="Origin">
        <option value="">All canon</option>
        <option value="people">Accepted by people</option>
        <option value="sample">Sample canon</option>
      </select>
      <button v-if="outdated.length || unchanged.length || recheckOnly" type="button" class="recheck-toggle" :class="{ on: recheckOnly, bad: outdated.length }" :aria-pressed="recheckOnly" @click="recheckOnly = !recheckOnly">
        <UiIcon name="history" :size="14" />Needs re-check <b>{{ outdated.length }}</b>
      </button>
    </template>
    <UiButton v-if="filtering" variant="ghost" @click="clearFilters">Clear</UiButton>
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
    <p v-if="outdated.length" class="small muted">{{ counted(outdated.length, 'fact cites', 'facts cite') }} a quote that a newer version of the source no longer has in one place; each citation says why. For each: see what changed, then propose a change or keep it as it is.</p>
  </div>

  <UiEmptyState v-if="!canon?.length && tab !== 'superseded'" title="No canon yet" icon="canon">
    Canon holds only facts a person accepted. Accept candidates in Review, or select words in a source and add them as a fact.
    <template #actions><UiButton variant="primary" :icon="fill.icon" :to="fill.to">{{ fill.label }}</UiButton></template>
  </UiEmptyState>

  <template v-else-if="tab === 'facts'">
    <UiEmptyState v-if="recheckOnly && !outdated.length" title="No outdated evidence" icon="check">
      Nothing left to re-check.
      <template #actions><UiButton @click="recheckOnly = false">Show all canon</UiButton></template>
    </UiEmptyState>
    <p v-else-if="!sorted.length" class="muted">No canon fact matches these filters. <button type="button" class="link" @click="clearFilters">Clear filters</button></p>
    <template v-else>
      <div id="canon-list" class="list-head">
        <span class="small muted">{{ counted(sorted.length, 'fact') }}<template v-if="pages > 1"> · showing {{ range }}</template></span>
        <label class="group-by small">Group by
          <select v-model="groupBy">
            <option value="kind">Kind</option>
            <option value="entity">Entity</option>
            <option value="document">Document</option>
          </select>
        </label>
      </div>
      <section v-for="g in pageGroups" :key="g.key" class="group">
        <h2><span>{{ labelOf(g.key) }}</span><span class="faint">{{ totals.get(g.key) }}</span></h2>
        <ul class="facts">
          <li v-for="f in g.facts" :id="`fact-${f.id}`" :key="f.id" class="fact" :class="{ open: open.has(f.id), target: f.id === target }">
            <button type="button" class="line" :aria-expanded="open.has(f.id)" @click="toggle(f.id)">
              <UiIcon name="down" :size="14" class="chev" />
              <UiBadge v-if="groupBy !== 'kind'" class="kb">{{ f.kind }}</UiBadge>
              <span class="text">{{ f.statement }}</span>
              <span class="flags">
                <UiBadge v-if="f.recheck === 'outdated'" tone="bad" dot>Evidence outdated</UiBadge>
                <UiBadge v-else-if="f.recheck === 'unchanged'" tone="warn">Source updated</UiBadge>
                <UiBadge v-if="f.origin === 'sample'" tone="pencil" title="Sample canon (preloaded): its quote is verified, but no person reviewed or decided it.">Sample</UiBadge>
                <span v-if="groupBy !== 'document'" class="src faint small">{{ docOf(f) }}</span>
                <span v-if="otherDocs(f).length" class="more-src faint small" :title="`Also cites ${otherDocs(f).join(', ')}`">+{{ counted(otherDocs(f).length, 'more source') }}</span>
              </span>
            </button>
            <div v-if="open.has(f.id)" class="more">
              <div class="row">
                <UiBadge v-if="f.time_label" :tone="f.precision === 'approximate' ? 'warn' : 'neutral'">{{ f.time_label }}</UiBadge>
                <UiBadge v-if="f.version > 1">v{{ f.version }}</UiBadge>
                <UiBadge v-if="f.origin === 'sample'" tone="pencil">Sample canon (preloaded)</UiBadge>
              </div>
              <FactSummary :fact="f" sources details />
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
            </div>
          </li>
        </ul>
      </section>
      <nav v-if="pages > 1" class="pager" aria-label="Pages">
        <UiButton size="sm" :disabled="page === 1" @click="goPage(page - 1)">Previous</UiButton>
        <span class="small muted">Page {{ page }} of {{ pages }}</span>
        <UiButton size="sm" :disabled="page === pages" @click="goPage(page + 1)">Next</UiButton>
      </nav>
    </template>
  </template>

  <UiPanel v-else-if="tab === 'graph'">
    <EntityGraph :facts="canon!" :selected="entity" />
  </UiPanel>

  <UiPanel v-else-if="tab === 'timeline'" title="Story timeline" description="One lane per character, by story time (Day 1 starts at 00:00; earlier days are D0, D-1, …) or in reading order.">
    <StoryTimeline :facts="timelineFacts" :all-facts="canon!" />
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
.filter select { width: auto; max-width: 220px; }
.list-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s-2); margin-bottom: var(--s-3); scroll-margin-top: 72px; }
.group-by { display: inline-flex; flex-direction: row; align-items: center; gap: var(--s-2); color: var(--muted); font-weight: 500; }
.group-by select { width: auto; }
.group { margin-bottom: var(--s-5); }
.group h2 { display: flex; align-items: baseline; gap: var(--s-2); margin: 0 0 var(--s-2); font-size: var(--text-sm); font-weight: 600; color: var(--muted); }
.facts { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--raised); overflow: hidden; }
.fact + .fact { border-top: 1px solid var(--line); }
.line { display: flex; align-items: center; gap: var(--s-2); width: 100%; min-height: 44px; padding: 6px var(--s-4) 6px var(--s-3); border: 0; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.line:hover { background: var(--surface); }
.line:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.chev { flex: none; color: var(--faint); transform: rotate(-90deg); transition: transform var(--dur-1) var(--ease); }
.open .chev { transform: none; }
.text { flex: 1 1 auto; min-width: 0; font-family: var(--font-story); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.open .text { white-space: normal; }
.flags { flex: none; display: inline-flex; align-items: center; gap: 6px; }
.more-src { white-space: nowrap; }
.src { max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.more { display: grid; gap: var(--s-3); padding: 0 var(--s-4) var(--s-4) calc(var(--s-3) + 22px); }
.more > .row:empty { display: none; }
.target { box-shadow: inset 3px 0 0 var(--accent); background: var(--accent-soft); scroll-margin-top: 72px; }
.target .line:hover { background: none; }
.pager { display: flex; align-items: center; justify-content: center; gap: var(--s-3); }
.link { padding: 0; border: 0; background: none; color: var(--accent); font: inherit; text-decoration: underline; cursor: pointer; }
.lineage { margin: 0; padding-left: var(--s-3); border-left: 3px solid var(--line-strong); }
.story { font-family: var(--font-story); color: var(--ink); }
@media (max-width: 720px) {
  .line { flex-wrap: wrap; padding: 10px var(--s-3); }
  .text { flex-basis: calc(100% - 30px); white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .open .text { display: block; }
  .kb { order: 1; margin-left: 22px; } /* phones: statement first, its badges on the line below */
  .flags { order: 2; flex-wrap: wrap; }
  .line:not(:has(.kb)) .flags { padding-left: 22px; }
  .flags:not(:has(.chip, .more-src)) { display: none; }
  .src { display: none; }
  .more { padding-left: var(--s-3); }
  .filter select { flex: 1 1 140px; max-width: none; min-height: 44px; }
}
</style>
