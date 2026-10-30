<script setup lang="ts">
useHead({ title: 'Entities · Story Bible' })
const me = useMe()
const route = useRoute()
const { data: list, refresh } = await useEntityList()
const editable = computed(() => canEdit(me.value))
const fill = useFillAction()

const q = ref('')
const kind = ref<EntityKind | ''>('')
const matches = (e: EntityListItem) => {
  const s = q.value.trim().toLowerCase()
  return !s || [...e.names, e.summary].some(t => t.toLowerCase().includes(s))
}
const searched = computed(() => list.value.filter(matches))
const count = (k: EntityKind) => searched.value.filter(e => e.kind === k).length
const groups = computed(() => ENTITY_KINDS
  .filter(k => !kind.value || k === kind.value)
  .map(k => ({ kind: k, items: searched.value.filter(e => e.kind === k) }))
  .filter(g => g.items.length))

// New page form
const creating = ref(route.query.new === '1')
const form = reactive({ name: '', kind: 'character' as EntityKind, summary: '' })
const busy = ref(false)
const error = ref('')
const nameInput = ref<HTMLInputElement>()
watch(creating, async (on) => {
  if (!on) return
  form.name = q.value.trim()
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
        <UiField label="Kind">
          <select v-model="form.kind">
            <option v-for="k in ENTITY_KINDS" :key="k" :value="k">{{ KIND_LABEL[k].one }}</option>
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
      <div v-if="searched.length" class="filters" role="group" aria-label="Filter by kind">
        <button type="button" class="f" :aria-pressed="!kind" @click="kind = ''">All <span>{{ searched.length }}</span></button>
        <template v-for="k in ENTITY_KINDS" :key="k">
          <button v-if="count(k) || kind === k" type="button" class="f" :aria-pressed="kind === k" @click="kind = kind === k ? '' : k">
            <UiIcon :name="k" :size="14" />{{ KIND_LABEL[k].many }} <span>{{ count(k) }}</span>
          </button>
        </template>
      </div>
    </div>

    <p v-if="!groups.length" class="muted none">
      No entity matches “{{ q }}”.
      <button v-if="editable" type="button" class="linkish" @click="creating = true">Create “{{ q.trim() }}”</button>
    </p>

    <section v-for="g in groups" :key="g.kind" class="group" :aria-labelledby="`k-${g.kind}`">
      <h2 :id="`k-${g.kind}`"><UiIcon :name="g.kind" :size="16" />{{ KIND_LABEL[g.kind].many }} <span class="faint">{{ g.items.length }}</span></h2>
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
.create-panel { margin-bottom: var(--s-5); }
.create { display: grid; gap: var(--s-3); max-width: 640px; }
.create-row { display: grid; grid-template-columns: 1fr 180px; gap: var(--s-3); }
.toolbar { display: grid; gap: var(--s-3); margin-bottom: var(--s-5); }
.search { position: relative; display: block; max-width: 420px; }
.search svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--faint); pointer-events: none; }
.search input { padding-left: 34px; width: 100%; }
.filters { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.f { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: var(--text-sm); color: var(--muted); background: var(--raised); border: 1px solid var(--line-strong); border-radius: var(--r-md); padding: 6px 12px; min-height: 34px; cursor: pointer; }
.f span { color: var(--faint); }
@media (max-width: 720px) {
  .filters { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 calc(-1 * var(--s-4)); padding: 0 var(--s-4); }
  .f { flex: none; }
}
.f:hover { color: var(--ink); }
.f[aria-pressed=true] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.f[aria-pressed=true] span { color: inherit; opacity: .8; }
.none { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: baseline; }
.linkish { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--accent); cursor: pointer; text-decoration: underline; }
.group { margin-bottom: var(--s-6); }
.group h2 { display: flex; align-items: center; gap: var(--s-2); margin: 0 0 var(--s-3); font-size: var(--text-md); }
.group h2 svg { color: var(--muted); }
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
