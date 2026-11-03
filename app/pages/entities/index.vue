<script setup lang="ts">
import type { IconName } from '~/components/ui/Icon.vue'

useHead({ title: 'Entities · CanonTracker' })
const me = useMe()
const route = useRoute()
const { data: list, refresh } = await useEntityList()
const editable = computed(() => canEdit(me.value))
const fill = useFillAction()
const { data: types } = await useEntityTypes()
const kindOf = useKind()

const q = ref('')
const kind = ref('')
const matches = (e: EntityListItem) => {
  const s = q.value.trim().toLowerCase()
  return !s || [...e.names, e.summary].some(t => t.toLowerCase().includes(s))
}
const searched = computed(() => list.value.filter(matches))
const count = (k: string) => searched.value.filter(e => e.kind === k).length
// The project's types in its order; a page whose type was removed outside the app still gets a group at the end.
const kinds = computed(() => [...new Set([...types.value.map(t => t.key), ...list.value.map(e => e.kind)])].map(kindOf))
// A big wiki (a whole novel's canon) opens with the most-named pages first; a small one by name. Both are one click away.
const sort = ref<'name' | 'facts'>(list.value.length > 60 ? 'facts' : 'name')

// "Possibly the same" (sameNameSuggestions): one name inside another of the same type. Only a suggestion: Merge opens the
// usual merge preview, and "Not the same" hides the pair for this person in this project (browser storage).
const hiddenKey = computed(() => `ct-not-same-${me.value?.current?.project.id ?? ''}`)
const hidden = ref<string[]>([])
onMounted(() => { try { hidden.value = JSON.parse(localStorage.getItem(hiddenKey.value) ?? '[]') } catch { hidden.value = [] } })
const pairKey = (s: { from: { id: string }, into: { id: string } }) => `${s.from.id}>${s.into.id}`
const suggestions = computed(() => sameNameSuggestions(list.value).filter(s => !hidden.value.includes(pairKey(s))).slice(0, 8))
const merging = ref('')
function notSame(s: { from: { id: string }, into: { id: string } }) {
  hidden.value = [...hidden.value, pairKey(s)]
  try { localStorage.setItem(hiddenKey.value, JSON.stringify(hidden.value)) } catch {}
}
const order = (a: EntityListItem, b: EntityListItem) => (sort.value === 'facts' ? b.facts - a.facts : 0) || a.name.localeCompare(b.name)
const groups = computed(() => kinds.value
  .filter(t => !kind.value || t.key === kind.value)
  .map(t => ({ type: t, items: searched.value.filter(e => e.kind === t.key).sort(order) }))
  .filter(g => g.items.length))

// New page form
const creating = ref(route.query.new === '1')
const form = reactive({ name: '', kind: '', summary: '' })
const busy = ref(false)
const error = ref('')
const nameInput = ref<HTMLInputElement>()
watch(creating, async (on) => {
  if (!on) return
  form.name = q.value.trim()
  form.kind = kind.value || (types.value.some(t => t.key === 'character') ? 'character' : types.value[0]?.key ?? '')
  error.value = ''
  await nextTick()
  nameInput.value?.focus()
}, { immediate: true })
async function create() {
  error.value = ''
  if (!form.name.trim()) {
    error.value = 'Give the page a name.'
    return
  }
  busy.value = true
  try {
    const { id } = await $fetch('/api/entities', { method: 'POST', body: form })
    await refresh()
    await navigateTo(`/entities/${id}`)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiPageHeader title="Entities" description="A page for every character, place, item and faction. Names in accepted canon get a page automatically; add your own for anything canon doesn’t cover yet.">
    <template v-if="editable && !creating && list.length" #actions>
      <UiButton variant="primary" icon="plus" @click="creating = true">New entity</UiButton>
    </template>
  </UiPageHeader>

  <UiPanel v-if="creating" title="New entity" description="Summary, aliases and fields are your team’s notes. They never become canon on their own." class="create-panel">
    <form class="create" novalidate @submit.prevent="create">
      <div class="create-row">
        <UiField label="Name" :error="error">
          <input ref="nameInput" v-model="form.name" type="text" maxlength="80" spellcheck="false" placeholder="e.g. The Tide Guard" @keydown.esc="creating = false">
        </UiField>
        <UiField label="Type">
          <select v-model="form.kind">
            <option v-for="t in types" :key="t.key" :value="t.key">{{ t.one }}</option>
          </select>
        </UiField>
      </div>
      <UiField label="Summary" hint="Optional. One or two lines a writer would want at hand.">
        <textarea v-model="form.summary" rows="2" maxlength="2000" />
      </UiField>
      <div class="row">
        <UiButton type="submit" variant="primary" :loading="busy">Create page</UiButton>
        <UiButton variant="ghost" @click="creating = false">Cancel</UiButton>
      </div>
    </form>
  </UiPanel>

  <UiPanel v-if="!list.length && !creating">
    <UiEmptyState title="No entities yet" icon="entities">
      Pages appear here as you accept canon: every character, place and object a fact names gets one. You can also add your own.
      <template #actions>
        <UiButton variant="primary" :icon="fill.icon" :to="fill.to">{{ fill.label }}</UiButton>
        <UiButton v-if="editable" icon="plus" @click="creating = true">New entity</UiButton>
      </template>
    </UiEmptyState>
  </UiPanel>

  <template v-else-if="list.length">
    <div class="toolbar">
      <label class="search">
        <UiIcon name="search" :size="16" />
        <input v-model="q" type="search" placeholder="Search names, aliases, summaries…" aria-label="Search entities">
      </label>
      <div class="filter-row">
        <div v-if="searched.length" class="filters" role="group" aria-label="Filter by type">
          <button type="button" class="f" :aria-pressed="!kind" @click="kind = ''">All <span>{{ searched.length }}</span></button>
          <template v-for="t in kinds" :key="t.key">
            <button v-if="count(t.key) || kind === t.key" type="button" class="f" :aria-pressed="kind === t.key" @click="kind = kind === t.key ? '' : t.key">
              <UiIcon :name="t.icon as IconName" :size="14" />{{ t.many }} <span>{{ count(t.key) }}</span>
            </button>
          </template>
        </div>
        <label class="small sort">Sort
          <select v-model="sort" aria-label="Sort entities"><option value="facts">Most canon facts</option><option value="name">Name</option></select>
        </label>
        <NuxtLink v-if="editable" :to="`/settings/projects/${me?.current?.project.id}#entity-types`" class="small manage"><UiIcon name="settings" :size="14" />Edit types</NuxtLink>
      </div>
    </div>

    <UiPanel v-if="editable && suggestions.length" title="Possibly the same" description="One name is part of another of the same type. Merge only if they are one and the same; you will see what changes first." class="same">
      <ul class="same-list">
        <li v-for="sg in suggestions" :key="pairKey(sg)">
          <div class="same-row">
            <span><NuxtLink :to="`/entities/${sg.from.id}`">{{ sg.from.name }}</NuxtLink> <span class="muted">({{ sg.from.facts }})</span> → <NuxtLink :to="`/entities/${sg.into.id}`">{{ sg.into.name }}</NuxtLink> <span class="muted">({{ sg.into.facts }})</span></span>
            <span class="same-actions">
              <UiButton size="sm" @click="merging = merging === pairKey(sg) ? '' : pairKey(sg)">Merge…</UiButton>
              <UiButton size="sm" variant="ghost" @click="notSame(sg)">Not the same</UiButton>
            </span>
          </div>
          <EntityMerge v-if="merging === pairKey(sg)" :entity="sg.from" :into="sg.into.id" @close="merging = ''" />
        </li>
      </ul>
    </UiPanel>

    <p v-if="!groups.length" class="muted none">
      No entity matches “{{ q }}”.
      <button v-if="editable" type="button" class="linkish" @click="creating = true">Create “{{ q.trim() }}”</button>
    </p>

    <section v-for="g in groups" :key="g.type.key" class="group" :aria-labelledby="`k-${g.type.key}`">
      <h2 :id="`k-${g.type.key}`" :class="`kt-${g.type.color}`"><UiIcon :name="g.type.icon as IconName" :size="16" />{{ g.type.many }} <span class="faint">{{ g.items.length }}</span></h2>
      <ul class="cards">
        <li v-for="e in g.items" :key="e.id">
          <NuxtLink :to="`/entities/${e.id}`" class="card-link">
            <EntityAvatar :entity="e" :size="48" />
            <span class="body">
              <span class="name">{{ e.name }}</span>
              <span v-if="e.summary" class="sum">{{ e.summary }}</span>
              <span v-else-if="e.first_fact" class="sum fact">{{ e.first_fact }}</span>
              <span class="meta">
                <span>{{ counted(e.facts, 'canon fact') }}</span>
                <span v-if="e.aliases.length" class="alias">aka {{ e.aliases.join(', ') }}</span>
              </span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </template>
</template>

<style scoped>
.same { margin-bottom: var(--s-5); }
.same-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }
.same-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s-2) var(--s-4); }
.same-actions { display: flex; gap: var(--s-2); }
.create-panel { margin-bottom: var(--s-5); }
.create { display: grid; gap: var(--s-3); max-width: 640px; }
.create-row { display: grid; grid-template-columns: 1fr 180px; gap: var(--s-3); }
.toolbar { display: grid; gap: var(--s-3); margin-bottom: var(--s-5); }
.search { position: relative; display: block; max-width: 420px; }
.search svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--faint); pointer-events: none; }
.search input { padding-left: 34px; width: 100%; }
.filter-row { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); align-items: center; justify-content: space-between; }
.filters { display: flex; flex-wrap: wrap; gap: var(--s-2); min-width: 0; }
.sort { display: inline-flex; align-items: center; gap: var(--s-2); color: var(--muted); }
.sort select { width: auto; min-height: 34px; }
.manage { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
.manage:hover { color: var(--accent); }
.f { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: var(--text-sm); color: var(--muted); background: var(--raised); border: 1px solid var(--line-strong); border-radius: var(--r-md); padding: 6px 12px; min-height: 34px; cursor: pointer; }
.f span { color: var(--faint); }
@media (max-width: 720px) {
  .filter-row { display: grid; justify-content: stretch; }
  .filters { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 calc(-1 * var(--s-4)); padding: 0 var(--s-4); }
  .f { flex: none; min-height: 44px; }
}
.f:hover { color: var(--ink); }
.f[aria-pressed=true] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.f[aria-pressed=true] span { color: inherit; opacity: .8; }
.none { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: baseline; }
.linkish { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--accent); cursor: pointer; text-decoration: underline; }
.group { margin-bottom: var(--s-6); }
.group h2 { display: flex; align-items: center; gap: var(--s-2); margin: 0 0 var(--s-3); font-size: var(--text-md); }
.group h2 svg { color: var(--tone, var(--muted)); }
.group h2 .faint { font-weight: 500; font-size: var(--text-sm); }
.cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--s-3); }
.card-link { display: flex; gap: var(--s-3); align-items: flex-start; height: 100%; padding: var(--s-3) var(--s-4); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); color: var(--ink); text-decoration: none; transition: border-color var(--dur-1) var(--ease); }
.card-link:hover { border-color: var(--line-strong); color: var(--ink); }
.card-link:hover .name { color: var(--accent); }
.card-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.body { display: grid; gap: 2px; min-width: 0; }
.name { font-weight: 600; overflow-wrap: anywhere; }
.sum { font-size: var(--text-sm); color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta { display: flex; flex-wrap: wrap; gap: 2px var(--s-3); font-size: var(--text-xs); color: var(--faint); margin-top: 2px; }
.sum.fact { font-family: var(--font-story); }
.alias { overflow-wrap: anywhere; }
@media (max-width: 720px) {
  .create-row { grid-template-columns: 1fr; }
  .cards { grid-template-columns: 1fr; }
}
</style>
