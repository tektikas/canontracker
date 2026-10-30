<script setup lang="ts">
useHead({ title: 'Projects · Story Bible' })
const route = useRoute()
const me = useMe()
const { data, refresh } = await useFetch('/api/projects')
const currentId = computed(() => me.value?.current?.project.id)

const creating = ref(route.query.new === '1')
const newName = ref('')
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
    reloadNuxtApp({ path: '/', force: true })
  } catch (e) {
    createError.value = errorMessage(e)
    createBusy.value = false
  }
}

const editing = ref('')
const editName = ref('')
const editError = ref('')
const busy = ref('')
function startRename(p: { id: string, name: string }) {
  editing.value = p.id
  editName.value = p.name
  editError.value = ''
}
async function rename(id: string) {
  editError.value = ''
  busy.value = id
  try {
    await $fetch(`/api/projects/${id}`, { method: 'PATCH', body: { name: editName.value } })
    editing.value = ''
    await Promise.all([refresh(), loadMe()])
  } catch (e) {
    editError.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}
async function open(id: string) {
  busy.value = id
  await openProject(id)
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const ago = (iso: string | null) => {
  if (!iso) return 'No activity yet'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 6e4)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  return `Last activity ${mins < 60 ? rtf.format(-mins, 'minute') : mins < 1440 ? rtf.format(-Math.round(mins / 60), 'hour') : rtf.format(-Math.round(mins / 1440), 'day')}`
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
        <div class="row">
          <UiButton type="submit" variant="primary" :loading="createBusy">Create and open</UiButton>
          <UiButton variant="ghost" @click="creating = false">Cancel</UiButton>
        </div>
      </form>
    </UiPanel>

    <ul class="projects">
      <li v-for="p in data.projects" :key="p.id" class="panel project" :class="{ current: p.id === currentId }">
        <form v-if="editing === p.id" class="rename" novalidate @submit.prevent="rename(p.id)">
          <UiField label="Project name" :error="editError">
            <input v-model="editName" type="text" maxlength="80" autofocus @keydown.esc="editing = ''">
          </UiField>
          <div class="row">
            <UiButton type="submit" size="sm" variant="primary" :loading="busy === p.id">Save</UiButton>
            <UiButton size="sm" variant="ghost" @click="editing = ''">Cancel</UiButton>
          </div>
        </form>
        <template v-else>
          <div class="project-head">
            <span class="project-icon"><UiIcon name="folder" :size="18" /></span>
            <div class="project-title">
              <h2>{{ p.name }}</h2>
              <span class="small faint">{{ ago(p.last_activity) }}</span>
            </div>
            <UiBadge v-if="p.id === currentId" tone="accent" dot>Open now</UiBadge>
          </div>
          <dl class="counts">
            <div><dt>Sources</dt><dd>{{ p.documents }}</dd></div>
            <div><dt>Canon facts</dt><dd>{{ p.canon }}</dd></div>
            <div><dt>To review</dt><dd :class="{ accent: p.pending }">{{ p.pending }}</dd></div>
          </dl>
          <div class="row project-actions">
            <UiButton v-if="p.id === currentId" size="sm" to="/">Go to home</UiButton>
            <UiButton v-else size="sm" variant="primary" :loading="busy === p.id" @click="open(p.id)">Open project</UiButton>
            <UiButton v-if="data.can_manage" size="sm" variant="ghost" @click="startRename(p)">Rename</UiButton>
          </div>
        </template>
      </li>
    </ul>
    <p v-if="!data.can_manage" class="small faint">Only owners and admins can create or rename projects.</p>
    <p class="sr-only" aria-live="polite">{{ data.projects.length }} {{ plural(data.projects.length, 'project') }}</p>
  </div>
</template>

<style scoped>
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.intro { margin: 0; max-width: 60ch; }
.create { display: grid; gap: var(--s-3); max-width: 460px; }
.projects { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--s-4); }
.project { display: grid; gap: var(--s-4); align-content: start; }
.project.current { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
.project-head { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: flex-start; }
.project-icon { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: var(--r-md); background: var(--sunken); color: var(--muted); }
.current .project-icon { background: var(--accent-soft); color: var(--accent); }
.project-title { flex: 1 1 9rem; min-width: min-content; }
.project-title .small { white-space: nowrap; }
.project-head .badge { flex: none; white-space: nowrap; }
.project-title h2 { margin: 0; font-size: var(--text-md); overflow-wrap: anywhere; }
.counts { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-2); margin: 0; padding: var(--s-3) 0; border-block: 1px solid var(--line); }
.counts dt { font-size: var(--text-xs); color: var(--faint); font-weight: 600; }
.counts dd { margin: 0; font-size: var(--text-lg); font-weight: 600; font-variant-numeric: tabular-nums; }
.counts dd.accent { color: var(--accent); }
.rename { display: grid; gap: var(--s-3); }
@media (max-width: 720px) { .projects { grid-template-columns: 1fr; } }
</style>
