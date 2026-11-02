<script setup lang="ts">
useHead({ title: 'Projects · Story Bible' })
const route = useRoute()
const me = useMe()
const { data } = await useFetch('/api/projects')
const currentId = computed(() => me.value?.current?.project.id)

const creating = ref(route.query.new === '1')
const newName = ref('')
// A new project can start from one of the sample sets; loading one is the same admin action as Load demo set on Home.
const SAMPLES = { empty: '', 'broken-tide': 'Broken Tide (demo)', 'lantern-row': 'Lantern Row (sample)', 'ashbell-pass': 'The Ashbell Pass (demo)' } as const
const HINTS: Record<keyof typeof SAMPLES, string> = {
  'empty': 'Add your own sources from Home.',
  'broken-tide': 'An island story in 13 sources with planted contradictions. In recorded mode its candidates replay a recorded run.',
  'lantern-row': 'Three short sources that come with five preloaded canon facts, each quoted from its source. Sample canon: no one reviewed it and no model proposed it.',
  'ashbell-pass': 'A mountain-town game in 28 sources, filed in folders with tags, plus wiki pages for its cast, places, items and quests. In recorded mode its candidates replay a recorded run.',
}
const startWith = ref<keyof typeof SAMPLES>('empty')
watch(startWith, (v, old) => { if (!newName.value.trim() || newName.value === SAMPLES[old]) newName.value = SAMPLES[v] })
const createBusy = ref(false)
const createError = ref('')
const createInput = ref<HTMLInputElement>()
watch(creating, async (on) => {
  if (!on) return
  await nextTick()
  createInput.value?.focus()
}, { immediate: true })

async function create() {
  createError.value = ''
  if (!newName.value.trim()) {
    createError.value = 'Name the project.'
    return
  }
  createBusy.value = true
  try {
    // Creating opens the new project, like switching to it.
    await $fetch('/api/projects', { method: 'POST', body: { name: newName.value, studio_id: data.value?.studio.id } })
    if (startWith.value !== 'empty') await $fetch('/api/demo/load', { method: 'POST', body: { set: startWith.value } })
    reloadNuxtApp({ path: '/', force: true })
  } catch (e) {
    createError.value = errorMessage(e)
    createBusy.value = false
  }
}

const q = ref('')
const shown = computed(() => {
  const t = q.value.trim().toLowerCase()
  return (data.value?.projects ?? []).filter(p => !t || p.name.toLowerCase().includes(t))
})
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const ago = (iso: string | null) => {
  if (!iso) return 'No activity yet'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 6e4)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  return mins < 60 ? rtf.format(-mins, 'minute') : mins < 1440 ? rtf.format(-Math.round(mins / 60), 'hour') : rtf.format(-Math.round(mins / 1440), 'day')
}
</script>

<template>
  <div v-if="data" class="stack" style="gap: var(--s-5)">
    <div class="spread">
      <p class="muted intro">Each project holds one game’s sources, canon, conflicts and changes. Nothing is shared between projects.</p>
      <UiButton v-if="data.can_manage && !creating" variant="primary" icon="plus" @click="creating = true">New project</UiButton>
    </div>

    <UiPanel v-if="creating" title="New project">
      <form class="create" novalidate @submit.prevent="create">
        <UiField label="Game or project name" :error="createError">
          <input ref="createInput" v-model="newName" type="text" maxlength="80" placeholder="e.g. Saltmarsh Chronicles" @keydown.esc="creating = false">
        </UiField>
        <UiField label="Start with" :hint="HINTS[startWith]">
          <select v-model="startWith">
            <option value="empty">An empty project</option>
            <option value="broken-tide">The Broken Tide demo</option>
            <option value="lantern-row">The Lantern Row sample (preloaded canon)</option>
            <option value="ashbell-pass">The Ashbell Pass demo (28 sources)</option>
          </select>
        </UiField>
        <div class="row">
          <UiButton type="submit" variant="primary" :loading="createBusy">{{ createBusy && startWith !== 'empty' ? 'Loading sources…' : 'Create and open' }}</UiButton>
          <UiButton variant="ghost" @click="creating = false">Cancel</UiButton>
        </div>
      </form>
    </UiPanel>

    <div v-if="data.projects.length > 5" class="search">
      <UiIcon name="search" :size="16" />
      <input v-model="q" type="search" aria-label="Search projects" placeholder="Search projects">
    </div>

    <ul class="projects">
      <li class="head" aria-hidden="true">
        <span>Project</span><span>Medium</span><span>Sources</span><span>Canon</span><span>Members</span><span>Last activity</span>
      </li>
      <li v-for="p in shown" :key="p.id" class="row-item" :class="{ current: p.id === currentId }">
        <NuxtLink :to="`/settings/projects/${p.id}`" class="name">
          <span class="project-icon"><UiIcon name="folder" :size="16" /></span>
          <b>{{ p.name }}</b>
          <UiBadge v-if="p.id === currentId" tone="accent" dot>Open now</UiBadge>
          <UiBadge v-if="p.pending" tone="neutral">{{ p.pending }} to review</UiBadge>
        </NuxtLink>
        <span data-l="Medium">{{ MEDIA[mediumOf(p.medium)].label }}</span>
        <span data-l="Sources">{{ p.documents }}</span>
        <span data-l="Canon">{{ p.canon }}</span>
        <span data-l="Members">{{ p.members }}</span>
        <span data-l="Last activity" class="faint">{{ ago(p.last_activity) }}</span>
      </li>
      <li v-if="!shown.length" class="empty muted">No project matches “{{ q }}”.</li>
    </ul>
    <p v-if="!data.can_manage" class="small faint">Only owners and admins can create or change projects.</p>
    <p class="sr-only" aria-live="polite">{{ plural(shown.length, 'project') }}</p>
  </div>
</template>

<style scoped>
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.intro { margin: 0; max-width: 60ch; }
.create { display: grid; gap: var(--s-3); max-width: 460px; }
.projects { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); }
.projects > li { display: grid; grid-template-columns: minmax(0, 2.4fr) 1fr .7fr .7fr .8fr 1.2fr; gap: var(--s-3); align-items: center; padding: var(--s-3) var(--s-4); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.projects > li + li { border-top: 1px solid var(--line); }
.head { font-size: var(--text-xs); font-weight: 600; color: var(--faint); }
.row-item.current { background: var(--accent-soft); }
.name { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); min-width: 0; color: var(--ink); text-decoration: none; }
.name b { overflow-wrap: anywhere; }
.name:hover b { text-decoration: underline; }
.project-icon { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: var(--r-md); background: var(--sunken); color: var(--muted); }
.search { position: relative; max-width: 340px; display: flex; align-items: center; }
.search > :first-child { position: absolute; left: 10px; color: var(--faint); pointer-events: none; }
.search input { padding-left: 32px; }
.empty { display: block !important; }
@media (max-width: 720px) {
  .head { display: none !important; }
  .projects > li { grid-template-columns: 1fr 1fr; gap: var(--s-2) var(--s-3); }
  .name { grid-column: 1 / -1; }
  [data-l]::before { content: attr(data-l); display: block; font-size: var(--text-xs); font-weight: 600; color: var(--faint); }
}
</style>
