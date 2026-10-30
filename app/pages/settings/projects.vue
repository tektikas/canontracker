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
// Medium decides which fields entity pages show (game: player hook, quest…). Values are kept when it changes.
const mediumBusy = ref('')
const mediumError = ref<{ id: string, message: string } | null>(null)
async function setMedium(id: string, medium: string) {
  mediumBusy.value = id
  mediumError.value = null
  try {
    await $fetch(`/api/projects/${id}`, { method: 'PATCH', body: { medium } })
    await Promise.all([refresh(), loadMe()])
  } catch (e) {
    mediumError.value = { id, message: errorMessage(e) }
  } finally {
    mediumBusy.value = ''
  }
}
// Art style is added to every image prompt in the project, so portraits and covers look like one game.
const artDraft = reactive<Record<string, string>>({})
const artBusy = ref('')
const artSaved = ref('')
const artError = ref<{ id: string, message: string } | null>(null)
async function saveArt(id: string) {
  artBusy.value = id
  artError.value = null
  artSaved.value = ''
  try {
    await $fetch(`/api/projects/${id}`, { method: 'PATCH', body: { art_style: artDraft[id] } })
    await refresh()
    delete artDraft[id]
    artSaved.value = id
  } catch (e) {
    artError.value = { id, message: errorMessage(e) }
  } finally {
    artBusy.value = ''
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
          <label class="medium">
            <span>Medium <span class="faint">· decides the fields on entity pages</span></span>
            <select v-if="data.can_manage" :value="p.medium" :disabled="mediumBusy === p.id" @change="setMedium(p.id, ($event.target as HTMLSelectElement).value)">
              <option v-for="(m, key) in MEDIA" :key="key" :value="key">{{ m.label }}</option>
            </select>
            <b v-else>{{ MEDIA[mediumOf(p.medium)].label }}</b>
            <span v-if="mediumError?.id === p.id" class="field-error" role="alert">{{ mediumError.message }}</span>
          </label>
          <div class="art">
            <label :for="`art-${p.id}`">Art style <span class="faint">· added to every generated image</span></label>
            <template v-if="data.can_manage">
              <textarea
                :id="`art-${p.id}`" rows="3" maxlength="500" placeholder="e.g. Muted coastal palette, weathered textures, hand-inked linework"
                :value="artDraft[p.id] ?? p.art_style" @input="artDraft[p.id] = ($event.target as HTMLTextAreaElement).value; artSaved = ''"
              />
              <div v-if="artDraft[p.id] !== undefined && artDraft[p.id] !== p.art_style" class="row">
                <UiButton size="sm" variant="primary" :loading="artBusy === p.id" @click="saveArt(p.id)">Save art style</UiButton>
                <UiButton size="sm" variant="ghost" @click="delete artDraft[p.id]">Cancel</UiButton>
              </div>
              <span v-else-if="artSaved === p.id" class="small good-text" role="status"><UiIcon name="check" :size="14" /> Saved</span>
              <span v-if="artError?.id === p.id" class="field-error" role="alert">{{ artError.message }}</span>
            </template>
            <p v-else :id="`art-${p.id}`" class="small" :class="{ faint: !p.art_style }">{{ p.art_style || 'Not set' }}</p>
          </div>
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
.project-head { display: flex; gap: var(--s-3); align-items: flex-start; }
.project-icon { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: var(--r-md); background: var(--sunken); color: var(--muted); }
.current .project-icon { background: var(--accent-soft); color: var(--accent); }
.project-title { flex: 1; min-width: 0; }
.project-title h2 { margin: 0; font-size: var(--text-md); overflow-wrap: anywhere; }
.counts { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-2); margin: 0; padding: var(--s-3) 0; border-block: 1px solid var(--line); }
.counts dt { font-size: var(--text-xs); color: var(--faint); font-weight: 600; }
.counts dd { margin: 0; font-size: var(--text-lg); font-weight: 600; font-variant-numeric: tabular-nums; }
.counts dd.accent { color: var(--accent); }
.rename { display: grid; gap: var(--s-3); }
.medium { display: grid; gap: 6px; font-size: var(--text-sm); }
.medium > span:first-child { font-weight: 500; }
.medium .faint { font-weight: 400; }
.medium select { max-width: 240px; }
.art { display: grid; gap: 6px; font-size: var(--text-sm); }
.art label { display: block; font-weight: 500; }
.art label .faint { font-weight: 400; }
.art p { margin: 0; overflow-wrap: anywhere; }
.good-text { display: inline-flex; align-items: center; gap: 4px; color: var(--good); font-weight: 500; }
@media (max-width: 720px) { .projects { grid-template-columns: 1fr; } }
</style>
