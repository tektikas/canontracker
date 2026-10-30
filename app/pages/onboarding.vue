<script setup lang="ts">
// Three steps, each saved as soon as it is done, so leaving halfway resumes at the next step:
// studio name → first project → demo or own files. The last step can be skipped.
definePageMeta({ layout: 'auth' })
useHead({ title: 'Set up your studio · Story Bible' })
const me = useMe()
const left = useLeftNotice()
const firstName = computed(() => me.value?.user?.name.split(' ')[0] ?? 'My')
const adminStudio = computed(() => me.value?.studios.find(s => s.role === 'owner' || s.role === 'admin'))

type Step = 'studio' | 'project' | 'start' | 'waiting'
const initial = (): Step => me.value?.current ? 'start' : adminStudio.value ? 'project' : me.value?.studios.length ? 'waiting' : 'studio'
const step = ref<Step>(initial())
const STEPS = [{ key: 'studio', label: 'Studio' }, { key: 'project', label: 'First project' }, { key: 'start', label: 'Get started' }] as const
const stepIndex = computed(() => STEPS.findIndex(s => s.key === step.value))

const studioName = ref(`${firstName.value}’s studio`)
const projectName = ref('')
const error = ref('')
const busy = ref<'' | 'studio' | 'project' | 'demo'>('')

async function run(kind: typeof busy.value, fn: () => Promise<void>) {
  error.value = ''
  busy.value = kind
  try {
    await fn()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}

const createStudio = () => run('studio', async () => {
  if (!studioName.value.trim()) throw new Error('Give your studio a name. You can change it later.')
  await $fetch('/api/studios', { method: 'POST', body: { name: studioName.value } })
  await loadMe()
  step.value = 'project'
})

const createProject = () => run('project', async () => {
  if (!projectName.value.trim()) throw new Error('Name the game or project you are writing.')
  await $fetch('/api/projects', { method: 'POST', body: { name: projectName.value, studio_id: adminStudio.value?.id } })
  await loadMe()
  step.value = 'start'
})

// The demo gets its own project, so the team's real project stays clean for their own files. A tiny second sample comes
// with it, so switching projects is something to try, not an empty menu. Broken Tide loads last and opens with the tour.
const tryDemo = () => run('demo', async () => {
  const studioId = me.value?.current?.studio.id ?? adminStudio.value?.id
  await $fetch('/api/projects', { method: 'POST', body: { name: 'Lantern Row (sample)', studio_id: studioId } })
  await $fetch('/api/demo/load', { method: 'POST', body: { set: 'lantern-row' } })
  await $fetch('/api/projects', { method: 'POST', body: { name: 'Broken Tide (demo)', studio_id: studioId } })
  await $fetch('/api/demo/load', { method: 'POST' })
  reloadNuxtApp({ path: '/?tour=1', force: true })
})
</script>

<template>
  <div class="onboard" :class="{ wide: step === 'start' }">
    <p v-if="left" class="notice info" role="status">You left {{ left }}, so you’re not in a studio right now. Create your own below, or ask for a new invite link.</p>
    <ol v-if="step !== 'waiting'" class="steps" aria-label="Setup progress">
      <li v-for="(s, i) in STEPS" :key="s.key" :class="{ done: i < stepIndex, now: i === stepIndex }" :aria-current="i === stepIndex ? 'step' : undefined">
        <span class="marker"><UiIcon v-if="i < stepIndex" name="check" :size="12" /><template v-else>{{ i + 1 }}</template></span>
        <span class="step-label">{{ s.label }}</span>
      </li>
    </ol>

    <form v-if="step === 'studio'" class="stack" novalidate @submit.prevent="createStudio">
      <div>
        <h1>Name your studio</h1>
        <p class="muted">Your studio is your team’s shared space. Everyone you invite joins it and works in its projects.</p>
      </div>
      <div class="panel stack form">
        <UiField label="Studio name" hint="Usually your company or team name. You can change it later.">
          <input v-model="studioName" type="text" maxlength="80" autofocus>
        </UiField>
        <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
        <UiButton type="submit" variant="primary" size="lg" :loading="busy === 'studio'">Continue<UiIcon name="arrow" :size="16" /></UiButton>
      </div>
    </form>

    <form v-else-if="step === 'project'" class="stack" novalidate @submit.prevent="createProject">
      <div>
        <h1>What are you writing?</h1>
        <p class="muted">A project holds one game’s lore, scenes and canon. Studios can have as many as they need.</p>
      </div>
      <div class="panel stack form">
        <UiField label="Game or project name" hint="For example the game’s working title. You can rename it later.">
          <input v-model="projectName" type="text" maxlength="80" placeholder="e.g. Saltmarsh Chronicles" autofocus>
        </UiField>
        <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
        <UiButton type="submit" variant="primary" size="lg" :loading="busy === 'project'">Create project<UiIcon name="arrow" :size="16" /></UiButton>
      </div>
    </form>

    <div v-else-if="step === 'start'" class="stack">
      <div>
        <h1>How do you want to start?</h1>
        <p class="muted">{{ me?.current?.project.name }} is ready. Try the workflow on a finished demo story first, or bring your own lore.</p>
      </div>
      <div class="options">
        <button type="button" class="option" :disabled="!!busy" @click="tryDemo">
          <span class="option-icon"><UiIcon name="demo" :size="20" /></span>
          <span class="option-title">Try the Broken Tide demo</span>
          <span class="option-text">An original island story, 2 lore documents and 11 scenes, with planted contradictions. It also adds Lantern Row, a three-page sample that comes with five preloaded canon facts, so you can switch projects. Both open in their own projects; {{ me?.current?.project.name }} stays empty.</span>
          <span class="option-cta">
            <template v-if="busy === 'demo'"><span class="spinner" aria-hidden="true" />Loading 16 sources…</template>
            <template v-else>Load demo and take the tour<UiIcon name="arrow" :size="16" /></template>
          </span>
        </button>
        <NuxtLink to="/" class="option" :class="{ disabled: !!busy }">
          <span class="option-icon"><UiIcon name="upload" :size="20" /></span>
          <span class="option-title">Bring your own story</span>
          <span class="option-text">Import Markdown or plain text lore docs and scene scripts (up to 1 MB each), or write and paste scenes in the app. Saved sources are read-only and never changed.</span>
          <span class="option-cta">Go to {{ me?.current?.project.name }}<UiIcon name="arrow" :size="16" /></span>
        </NuxtLink>
      </div>
      <p v-if="me?.model.mode === 'mock'" class="notice warn">
        <span><b>Recorded run.</b> The model is offline in this instance, so extraction replays a recorded run of the demo story. Your own files import fine but get no candidates until a live model is connected; you can add facts from their text by hand.</span>
      </p>
      <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
      <p class="small muted center"><NuxtLink to="/">Skip for now</NuxtLink> · you can load the demo, import files or write a document any time from Home.</p>
    </div>

    <div v-else class="stack">
      <div>
        <h1>No projects yet</h1>
        <p class="muted">You’re in {{ me?.studios[0]?.name }} as {{ ROLE_LABEL[(me?.studios[0]?.role ?? 'viewer') as Role].toLowerCase() }}, but it has no projects yet. Ask a studio owner or admin to create one, then reload this page.</p>
      </div>
      <UiButton variant="primary" @click="reloadNuxtApp({ path: '/', force: true })">Check again</UiButton>
    </div>
  </div>
</template>

<style scoped>
.onboard > .notice { margin-bottom: var(--s-5); }
.onboard.wide { max-width: 720px !important; }
.onboard h1 { margin-bottom: var(--s-1); }
.onboard .stack { gap: var(--s-5); }
.form { gap: var(--s-4) !important; padding: var(--s-5); }
.form .btn { width: 100%; }
.center { text-align: center; margin: 0; }

.steps { list-style: none; display: flex; gap: var(--s-2); margin: 0 0 var(--s-6); padding: 0; }
.steps li { display: flex; align-items: center; gap: var(--s-2); color: var(--faint); font-size: var(--text-sm); font-weight: 500; }
.steps li + li::before { content: ""; width: 28px; border-top: 1.5px dashed var(--line-strong); }
.steps li.done + li::before { border-top-style: solid; border-color: var(--accent); }
.marker { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; border: 1.5px dashed var(--pencil); font-size: var(--text-xs); font-weight: 600; }
.done .marker { border: 0; background: var(--accent); color: var(--accent-ink); }
.now { color: var(--ink) !important; }
.now .marker { border: 2px solid var(--accent); color: var(--accent); }

.options { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
.option { display: grid; grid-template-rows: auto auto 1fr auto; gap: var(--s-2); justify-items: start; padding: var(--s-5); text-align: left; font: inherit; color: var(--ink); text-decoration: none; background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); cursor: pointer; transition: border-color var(--dur-1) var(--ease); }
.option:hover:not(:disabled) { border-color: var(--accent); color: var(--ink); }
.option:first-child { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
.option:disabled, .option.disabled { cursor: progress; pointer-events: none; }
.option-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--r-md); background: var(--accent-soft); color: var(--accent); }
.option-title { font-size: var(--text-md); font-weight: 600; }
.option-text { color: var(--muted); font-size: var(--text-sm); }
.option-cta { display: inline-flex; align-items: center; gap: 6px; margin-top: var(--s-2); color: var(--accent); font-weight: 600; }
@media (max-width: 720px) {
  .options { grid-template-columns: 1fr; }
  .steps { margin-bottom: var(--s-5); }
  .step-label { display: none; }
  .now .step-label { display: inline; }
}
</style>
