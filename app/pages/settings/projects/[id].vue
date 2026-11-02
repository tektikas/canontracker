<script setup lang="ts">
const route = useRoute()
const me = useMe()
const id = computed(() => String(route.params.id))
// The API answers 404 for a project outside the user's studios; show the app's not-found page.
const { data, error, refresh } = await useFetch(() => `/api/projects/${id.value}`)
if (error.value) throw createError({ statusCode: error.value.statusCode === 404 ? 404 : 500, statusMessage: error.value.statusCode === 404 ? 'Project not found' : 'Could not load the project', fatal: true })
const project = computed(() => data.value!.project)
const manage = computed(() => data.value!.can_manage)
const isCurrent = computed(() => me.value?.current?.project.id === id.value)
useHead(() => ({ title: `${project.value.name} · Projects · Story Bible` }))

const busy = ref('')
const error1 = ref('')
async function patch(body: Record<string, unknown>, key: string) {
  busy.value = key
  error1.value = ''
  try {
    await $fetch(`/api/projects/${id.value}`, { method: 'PATCH', body })
    await Promise.all([refresh(), loadMe()])
    return true
  } catch (e) {
    error1.value = errorMessage(e)
    return false
  } finally {
    busy.value = ''
  }
}

const name = ref(project.value.name)
const nameDirty = computed(() => name.value.trim() !== project.value.name)
const saveName = () => patch({ name: name.value }, 'name')
// Medium decides which fields entity pages show (game: player hook, quest…). Values are kept when it changes.
// Before any entity page exists it also swaps the project's untouched default types, so reload them.
const setMedium = async (e: Event) => { if (await patch({ medium: (e.target as HTMLSelectElement).value }, 'medium') && isCurrent.value) await refreshEntityTypes() }

// Art style is added to every image prompt in the project, so portraits and covers look like one game.
const art = ref(project.value.art_style)
const artState = ref<'' | 'saving' | 'saved'>('')
let artTimer: ReturnType<typeof setTimeout>
async function saveArt() {
  clearTimeout(artTimer)
  if (art.value === project.value.art_style) return
  const value = art.value
  artState.value = 'saving'
  artState.value = await patch({ art_style: value }, 'art') ? 'saved' : ''
}
function typeArt() {
  artState.value = ''
  clearTimeout(artTimer)
  artTimer = setTimeout(saveArt, 800)
}
onBeforeUnmount(saveArt)

// Research profile: sent with every research question in this project, so answers fit its world without being asked.
const profile = reactive({ ...project.value.research_profile })
const profileDirty = computed(() => (Object.keys(profile) as (keyof typeof profile)[]).some(k => profile[k] !== project.value.research_profile[k]))
const profileSaved = ref(false)
async function saveProfile() {
  profileSaved.value = await patch({ research_profile: { ...profile } }, 'profile')
}
watch(profile, () => { profileSaved.value = false })

// Per-rule default severity for new scans. Existing conflicts keep theirs.
const RULE_LABEL: Record<string, string> = {
  EXACT_TIME_LOCATION_OVERLAP: 'Same person, two places, exact times overlap',
  APPROX_TIME_LOCATION_OVERLAP: 'Same person, two places, approximate times overlap',
  RELATIONSHIP_AFTER_END: 'Relationship used after it ended',
  TRAVEL_TIME_TOO_SHORT: 'Not enough time to travel (near-limit trips are soft unless you change this)',
  WORLD_RULE_VIOLATION: 'Fact breaks a world rule (model-suggested)',
}
const setSeverity = (rule: string, e: Event) => patch({ severity_defaults: { [rule]: (e.target as HTMLSelectElement).value } }, 'sev')

// Sample loads act on the project the session has open, so open this one first. Replacing data is destructive: always confirm.
const SAMPLES = [
  { set: 'broken-tide', label: 'Broken Tide demo', hint: 'An island story in 13 sources with planted contradictions.' },
  { set: 'lantern-row', label: 'Lantern Row sample', hint: 'Three short sources with five preloaded canon facts.' },
  { set: 'ashbell-pass', label: 'The Ashbell Pass demo', hint: 'A mountain-town game in 28 sources, in folders, with NPCs, quests and planted contradictions.' },
]
const sampleError = ref('')
async function loadSample(s: typeof SAMPLES[number]) {
  if (!(await askConfirm({ title: `Replace everything in ${project.value.name}?`, body: `${s.label} takes its place: sources, canon, conflicts and changes are removed. The audit trail keeps its history; other projects are not touched.`, confirm: `Replace with ${s.label}`, danger: true }))) return
  busy.value = s.set
  sampleError.value = ''
  try {
    if (!isCurrent.value) await $fetch(`/api/projects/${id.value}/switch`, { method: 'POST' })
    await $fetch('/api/demo/load', { method: 'POST', body: { set: s.set, expect_project: id.value } })
    reloadNuxtApp({ path: '/', force: true })
  } catch (e) {
    sampleError.value = errorMessage(e)
    busy.value = ''
  }
}

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
      <NuxtLink to="/settings/projects" class="back"><UiIcon name="arrow" :size="14" style="transform: scaleX(-1)" /> All projects</NuxtLink>
      <div class="row">
        <UiBadge v-if="isCurrent" tone="accent" dot>Open now</UiBadge>
        <UiButton v-if="isCurrent" size="sm" to="/">Go to home</UiButton>
        <UiButton v-else size="sm" variant="primary" :loading="busy === 'open'" @click="busy = 'open'; openProject(id)">Open project</UiButton>
      </div>
    </div>

    <h2 class="title">{{ project.name }}</h2>
    <dl class="counts">
      <div><dt>Sources</dt><dd>{{ project.documents }}</dd></div>
      <div><dt>Canon facts</dt><dd>{{ project.canon }}</dd></div>
      <div><dt>To review</dt><dd :class="{ accent: project.pending }">{{ project.pending }}</dd></div>
      <div><dt>Members</dt><dd>{{ project.members }}</dd></div>
      <div><dt>Last activity</dt><dd class="small">{{ ago(project.last_activity) }}</dd></div>
    </dl>

    <p v-if="error1" class="field-error" role="alert">{{ error1 }}</p>

    <UiPanel title="General" :description="manage ? undefined : 'Only owners and admins can change these.'">
      <div class="form">
        <form class="field" novalidate @submit.prevent="saveName">
          <label for="pname">Project name</label>
          <div class="row">
            <input id="pname" v-model="name" type="text" maxlength="80" :disabled="!manage">
            <UiButton v-if="manage" type="submit" variant="primary" :disabled="!nameDirty" :loading="busy === 'name'">Save</UiButton>
          </div>
        </form>
        <div class="field">
          <label for="pmedium">Medium <span class="faint">· decides the fields on entity pages</span></label>
          <select v-if="manage" id="pmedium" :value="project.medium" :disabled="busy === 'medium'" @change="setMedium">
            <option v-for="(m, key) in MEDIA" :key="key" :value="key">{{ m.label }}</option>
          </select>
          <b v-else id="pmedium">{{ MEDIA[mediumOf(project.medium)].label }}</b>
        </div>
        <div class="field">
          <label for="part">Art style <span class="faint">· added to every generated image</span></label>
          <template v-if="manage">
            <textarea id="part" v-model="art" rows="3" maxlength="500" placeholder="e.g. Muted coastal palette, weathered textures, hand-inked linework" @input="typeArt" @blur="saveArt" />
            <span v-if="artState === 'saving'" class="small faint" role="status">Saving…</span>
            <span v-else-if="artState === 'saved'" class="small good-text" role="status"><UiIcon name="check" :size="14" /> Saved</span>
            <span v-else-if="art !== project.art_style" class="small faint">Saves when you stop typing</span>
          </template>
          <p v-else id="part" class="small" :class="{ faint: !project.art_style }">{{ project.art_style || 'Not set' }}</p>
        </div>
      </div>
    </UiPanel>

    <UiPanel id="research-profile" title="Research profile" :description="manage ? 'Sent with every Research question in this project, so answers fit your world.' : 'Sent with every Research question. Only owners and admins can change it.'">
      <form class="form" novalidate @submit.prevent="saveProfile">
        <UiField label="Field">
          <select v-model="profile.field" :disabled="!manage">
            <option v-for="(l, k) in RESEARCH_FIELDS" :key="k" :value="k">{{ l }}</option>
          </select>
        </UiField>
        <UiField label="Period" hint="e.g. London, 1850s · near future, 2190s"><input v-model="profile.period" type="text" :maxlength="PROFILE_LIMITS.period" :disabled="!manage"></UiField>
        <UiField label="Place"><input v-model="profile.place" type="text" :maxlength="PROFILE_LIMITS.place" :disabled="!manage" placeholder="e.g. Victorian London · Jupiter system"></UiField>
        <UiField label="Legal system or procedure" hint="For crime stories, e.g. English common law, Metropolitan Police 1850"><input v-model="profile.legal_system" type="text" :maxlength="PROFILE_LIMITS.legal_system" :disabled="!manage"></UiField>
        <UiField label="Notes for research" hint="Anything research should keep in mind"><textarea v-model="profile.notes" rows="3" :maxlength="PROFILE_LIMITS.notes" :disabled="!manage" /></UiField>
        <div v-if="manage" class="row">
          <UiButton type="submit" variant="primary" :disabled="!profileDirty" :loading="busy === 'profile'">Save profile</UiButton>
          <span v-if="profileSaved && !profileDirty" class="small good-text" role="status"><UiIcon name="check" :size="14" /> Saved</span>
        </div>
      </form>
    </UiPanel>

    <UiPanel title="Conflict severity by rule" description="Default for new scans. Existing conflicts keep theirs.">
      <table class="sev">
        <thead><tr><th scope="col">Rule</th><th scope="col">Default</th></tr></thead>
        <tbody>
          <tr v-for="(label, rule) in RULE_LABEL" :key="rule">
            <td>{{ label }}</td>
            <td>
              <select v-if="manage" :aria-label="`Default severity: ${label}`" :value="project.severity_defaults[rule]" :disabled="busy === 'sev'" @change="setSeverity(rule, $event)">
                <option value="hard">Hard</option><option value="soft">Soft</option>
              </select>
              <b v-else>{{ project.severity_defaults[rule] === 'hard' ? 'Hard' : 'Soft' }}</b>
            </td>
          </tr>
        </tbody>
      </table>
    </UiPanel>

    <!-- Entity types are edited on the open project (the API acts on it). -->
    <EntityTypesEditor v-if="isCurrent" :project="project.name" />
    <UiPanel v-else id="entity-types" title="Entity types" description="Types group pages on Entities, in the graph and in exports.">
      <div class="row">
        <span class="small faint">Open this project to edit its types.</span>
        <UiButton size="sm" :loading="busy === 'types'" @click="busy = 'types'; openProject(id, `/settings/projects/${id}#entity-types`)">Open and edit types</UiButton>
      </div>
    </UiPanel>

    <UiPanel v-if="manage" title="Danger zone" description="Load a sample into this project. This replaces everything in it.">
      <ul class="samples">
        <li v-for="s in SAMPLES" :key="s.set">
          <div><b>{{ s.label }}</b><span class="small faint">{{ s.hint }}</span></div>
          <UiButton size="sm" variant="danger" :loading="busy === s.set" @click="loadSample(s)">Replace with this</UiButton>
        </li>
      </ul>
      <p v-if="sampleError" class="field-error" role="alert">{{ sampleError }}</p>
    </UiPanel>
  </div>
</template>

<style scoped>
.back { display: inline-flex; align-items: center; gap: 4px; font-size: var(--text-sm); color: var(--muted); text-decoration: none; }
.back:hover { color: var(--ink); }
.title { margin: 0; font-size: var(--text-xl); overflow-wrap: anywhere; }
.counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: var(--s-3); margin: 0; padding: var(--s-3) 0; border-block: 1px solid var(--line); }
.counts dt { font-size: var(--text-xs); color: var(--faint); font-weight: 600; }
.counts dd { margin: 0; font-size: var(--text-lg); font-weight: 600; font-variant-numeric: tabular-nums; }
.counts dd.small { font-size: var(--text-sm); }
.counts dd.accent { color: var(--accent); }
.form { display: grid; gap: var(--s-4); max-width: 520px; }
.field { display: grid; gap: 6px; font-size: var(--text-sm); }
.field label { display: block; font-weight: 500; }
.field .row input { flex: 1 1 0; min-width: 0; }
.field .row { flex-wrap: nowrap; }
.field label .faint { font-weight: 400; }
.field select { max-width: 240px; }
.field p { margin: 0; overflow-wrap: anywhere; }
.good-text { display: inline-flex; align-items: center; gap: 4px; color: var(--good); font-weight: 500; }
.sev { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.sev th, .sev td { text-align: left; padding: 8px 4px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.sev select { width: auto; }
.samples { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }
.samples li { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; justify-content: space-between; }
.samples li > div { display: grid; gap: 2px; }
</style>
