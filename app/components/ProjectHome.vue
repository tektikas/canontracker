<script setup lang="ts">
const me = useMe()
const left = useLeftNotice()
const editor = computed(() => canEdit(me.value))
const admin = computed(() => canManage(me.value))
const projectName = computed(() => me.value?.current?.project.name ?? 'this project')
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const { data: docs, refresh: refreshDocs } = await useFetch('/api/documents')
const { data: conflicts, refresh: refreshConflicts } = await useFetch('/api/conflicts')
const { data: evals, refresh: refreshEvals } = await useFetch('/api/eval')
// No scan record in the API: a scan in this session (set on /conflicts) counts until new sources arrive.
const scanned = useState('conflicts-scanned', () => false)
const busy = ref<'' | 'demo' | 'import'>('')
const error = ref('')
const results = ref<Record<string, any>[]>([])
const fileInput = ref<HTMLInputElement>()

async function run(kind: 'demo' | 'import', fn: () => Promise<{ results: Record<string, any>[] }>) {
  busy.value = kind
  error.value = ''
  try {
    results.value = (await fn()).results
    scanned.value = false
    await Promise.all([refreshDocs(), refreshConflicts(), refreshEvals(), refreshNuxtData('stats'), refreshEntities()])
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}

function loadDemo() {
  if (stats.value?.documents && !confirm(`Replace everything in ${projectName.value} with the Broken Tide demo set? Other projects are not touched.`)) return
  run('demo', () => $fetch('/api/demo/load', { method: 'POST' }))
}

function upload(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  const form = new FormData()
  for (const f of input.files) form.append('files', f)
  run('import', () => $fetch('/api/documents', { method: 'POST', body: form }))
  input.value = ''
}

const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`

// The workflow, in order. `done` reflects stored data only; the first step that isn't done is the next action.
const steps = computed(() => {
  const s = stats.value
  if (!s) return []
  const found = conflicts.value?.length ?? 0
  const runs = evals.value?.length ?? 0
  return [
    { key: 'import', label: 'Import', to: '#sources', value: s.documents, caption: plural(s.documents, 'source'), done: s.documents > 0 },
    { key: 'review', label: 'Review', to: '/review', value: s.pending || null, caption: s.pending ? 'to review' : s.documents ? 'all reviewed' : 'nothing yet', done: s.documents > 0 && s.pending === 0 },
    { key: 'canon', label: 'Canon', to: '/canon', value: s.canon, caption: plural(s.canon, 'fact'), done: s.canon > 0 },
    { key: 'conflicts', label: 'Conflicts', to: '/conflicts', value: s.open_conflicts || null, caption: s.open_conflicts ? 'open' : found || scanned.value ? 'none open' : s.canon ? 'none open · scan to check' : 'nothing yet', done: s.canon > 0 && s.open_conflicts === 0 && (found > 0 || scanned.value), skip: s.canon > 0 && s.open_conflicts === 0 },
    { key: 'changes', label: 'Changes', to: '/changes', value: s.changes, caption: plural(s.changes, 'proposal'), done: s.changes > 0 },
    { key: 'metrics', label: 'Metrics', to: '/metrics', value: runs, caption: plural(runs, 'run'), done: runs > 0 },
  ]
})
// `skip`: no open conflicts but no scan on record either. Shown neutrally, never recommended over the next real step.
const nextKey = computed(() => steps.value.find(s => !s.done && !s.skip)?.key ?? 'done')

const next = computed(() => {
  const s = stats.value
  switch (nextKey.value) {
    case 'import': return editor.value
      ? { title: 'Add your lore and scenes', text: admin.value ? 'Load the demo set or import Markdown and text files. Sources are stored read-only.' : 'Import Markdown and text files. Sources are stored read-only.' }
      : { title: 'No sources yet', text: 'An editor on your team imports lore and scenes. You will see them here as soon as they do.' }
    case 'review': return editor.value
      ? { title: `Review ${s?.pending} ${plural(s?.pending ?? 0, 'candidate')}`, text: 'The model proposed these facts with a quote. Nothing becomes canon until you accept it.', to: '/review', action: 'Start review' }
      : { title: `${s?.pending} ${plural(s?.pending ?? 0, 'candidate')} waiting for review`, text: 'The model proposed these facts with a quote. An editor on your team decides which become canon.', to: '/review', action: 'See candidates' }
    case 'canon': return s?.rejected
      ? { title: 'Nothing is canon yet', text: 'Every candidate was rejected. Import more sources or check the rejected list.', to: '/review', action: 'Open review' }
      : { title: 'Nothing is canon yet', text: 'No candidates were extracted. Check the import results, or import more sources.', to: '#sources', action: 'Add sources' }
    // only reachable with open conflicts: zero open is `done` or `skip`
    case 'conflicts': return editor.value
      ? { title: `Decide on ${s?.open_conflicts} possible ${plural(s?.open_conflicts ?? 0, 'conflict')}`, text: 'Each one is a candidate for you to confirm or dismiss. Deciding never edits canon.', to: '/conflicts', action: 'Resolve conflicts' }
      : { title: `${s?.open_conflicts} possible ${plural(s?.open_conflicts ?? 0, 'conflict')} open`, text: 'An editor on your team confirms or dismisses each one. Deciding never edits canon.', to: '/conflicts', action: 'View conflicts' }
    case 'changes': if (!editor.value) return { title: 'No change proposals yet', text: 'When an editor proposes a canon change, its impact shows up on Changes. Meanwhile, ask canon a question.', to: '/ask', action: 'Ask canon' }
      return { title: 'Propose a canon change', text: 'See which facts and scenes a change would touch, up to two hops away, before it reaches a build.', to: '/changes', action: 'Propose a change' }
    case 'metrics': return { title: 'Measure the run', text: 'Score extraction, conflicts and impact against the gold set.', to: '/metrics', action: 'Open metrics' }
    default: return { title: 'Canon is up to date', text: 'Nothing is waiting on you. Ask canon a question or check the audit log.', to: '/ask', action: 'Ask canon' }
  }
})
</script>

<template>
  <p v-if="left" class="notice info home-notice" role="status">You left {{ left }}. You’re now working in {{ me?.current?.studio.name ?? 'another studio' }}.</p>
  <UiPageHeader title="Overview">
    <template v-if="stats?.documents">
      {{ stats.documents }} {{ plural(stats.documents, 'source') }}, {{ stats.scenes }} of them {{ plural(stats.scenes, 'scene') }}.
      Canon holds only facts a person accepted, each tied to its exact passage.
    </template>
    <template v-else>
      Import lore and scenes. The model proposes facts with a quote; only the facts you accept become canon.
    </template>
  </UiPageHeader>

  <p v-if="['recorded', 'mixed'].includes(provenance(stats?.data_model_id).kind)" class="notice warn home-notice">
    <span><b>Recorded run.</b> Candidates and model checks are replayed from a recorded extraction, not a live model call.</span>
  </p>

  <section class="panel flush workflow" aria-labelledby="workflow-title">
    <h2 id="workflow-title" class="sr-only">Workflow</h2>
    <ol class="rail">
      <li v-for="(s, i) in steps" :key="s.key" class="rail-step" :class="{ 'is-done': s.done, 'is-next': s.key === nextKey }">
        <NuxtLink :to="s.to" class="rail-link" :aria-current="s.key === nextKey ? 'step' : undefined">
          <span class="rail-marker">
            <UiIcon v-if="s.done" name="check" :size="14" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span class="rail-text">
            <span class="rail-label">{{ s.label }}</span>
            <span class="rail-value"><b v-if="s.value != null">{{ s.value }}</b> {{ s.caption }}</span>
          </span>
        </NuxtLink>
      </li>
    </ol>
    <div class="next">
      <div class="next-text">
        <span class="next-kicker">{{ nextKey === 'done' ? 'All steps' : 'Next step' }}</span>
        <h3>{{ next.title }}</h3>
        <p>{{ next.text }}</p>
      </div>
      <div class="row">
        <template v-if="nextKey === 'import'">
          <UiButton v-if="admin" variant="primary" icon="demo" :loading="busy === 'demo'" :disabled="!!busy" @click="loadDemo">Load demo set</UiButton>
          <UiButton v-if="editor" :variant="admin ? 'secondary' : 'primary'" icon="upload" :loading="busy === 'import'" :disabled="!!busy" @click="fileInput?.click()">Import files</UiButton>
        </template>
        <UiButton v-else variant="primary" :to="next.to">{{ next.action }}<UiIcon name="arrow" :size="16" /></UiButton>
      </div>
    </div>
  </section>

  <p v-if="busy" class="notice info" role="status">{{ busy === 'demo' ? 'Loading the demo set and extracting candidates…' : 'Importing and extracting candidates…' }}</p>
  <p v-if="error" class="notice bad" role="alert">{{ error }}</p>

  <div class="home-grid" :class="{ solo: !editor }">
    <div class="stack" style="gap: var(--s-5)">
      <UiPanel v-if="results.length" title="Import results" flush>
        <template #actions><UiButton size="sm" to="/review">Review candidates</UiButton></template>
        <div class="table-wrap">
          <table>
            <thead><tr><th>File</th><th>Result</th><th class="num">Passages</th><th class="num">Candidates</th></tr></thead>
            <tbody>
              <tr v-for="r in results" :key="r.filename">
                <td>{{ r.filename }}</td>
                <td>
                  <UiBadge v-if="r.status === 'imported'" tone="good">Imported v{{ r.version }}</UiBadge>
                  <UiBadge v-else-if="r.status === 'duplicate'" tone="warn">Already imported</UiBadge>
                  <UiBadge v-else tone="bad">{{ r.error }}</UiBadge>
                  <div v-if="r.extraction_error" class="field-error">Extraction failed: {{ r.extraction_error }}</div>
                  <div v-else-if="r.status === 'imported' && r.candidates === 0" class="small muted">{{ stats?.model.mode === 'mock'
                    ? 'No candidates: the recorded run only covers the Broken Tide demo files. Switch to a live model to extract from your own files.'
                    : 'No candidates: the model found no facts it could quote from this file.' }}</div>
                </td>
                <td class="num">{{ r.passages ?? '—' }}</td>
                <td class="num">
                  {{ r.candidates ?? '—' }}
                  <UiBadge v-if="r.unverified" tone="bad">{{ r.unverified }} unverified</UiBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiPanel>

      <UiPanel title="Sources" :description="docs?.length ? 'Read-only. Open one to see its passages and the canon cited from it.' : undefined" flush>
        <UiEmptyState v-if="!docs?.length" icon="file" title="No sources yet">
          {{ admin ? 'Load the demo set or import your own lore and scene files.' : editor ? 'Import your own lore and scene files.' : 'Nothing has been imported into this project yet.' }}
        </UiEmptyState>
        <div v-else class="table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Type</th><th class="num">Version</th><th class="num hide-sm">Passages</th><th class="num">Canon</th><th class="hide-sm">SHA-256</th></tr></thead>
            <tbody>
              <tr v-for="d in docs" :key="String(d.id)">
                <td><NuxtLink :to="`/documents/${d.id}`" class="doc-link">{{ d.title }}</NuxtLink></td>
                <td><UiBadge>{{ d.kind }}</UiBadge></td>
                <td class="num">v{{ d.version }}</td>
                <td class="num hide-sm">{{ d.passages }}</td>
                <td class="num">{{ d.canon_facts }}</td>
                <td class="mono faint hide-sm">{{ String(d.sha256).slice(0, 10) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiPanel>
    </div>

    <UiPanel v-if="editor" id="sources" title="Add sources" as="aside" class="sources">
      <div class="stack">
        <div v-if="admin && nextKey !== 'import'" class="source-option">
          <h3>Broken Tide demo</h3>
          <p>An original island story: 2 lore documents and 11 scenes. Loading it replaces everything in {{ projectName }}; other projects are not touched.</p>
          <UiButton icon="demo" :loading="busy === 'demo'" :disabled="!!busy" @click="loadDemo">Load demo set</UiButton>
        </div>
        <div class="source-option">
          <h3>Your files</h3>
          <p>Markdown or plain text, up to 1 MB each. Re-importing an unchanged file is detected; a changed one becomes a new version.</p>
          <UiButton icon="upload" :loading="busy === 'import'" :disabled="!!busy" @click="fileInput?.click()">Import files</UiButton>
          <input ref="fileInput" type="file" accept=".md,.markdown,.txt" multiple hidden @change="upload">
        </div>
      </div>
    </UiPanel>
  </div>
</template>

<style scoped>
.home-notice { margin-bottom: var(--s-4); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Workflow rail: the one bold element on this page. */
.workflow { margin-bottom: var(--s-5); }
.rail { list-style: none; margin: 0; padding: var(--s-5) var(--s-4) var(--s-4); display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); }
.rail-step { position: relative; }
/* connector from the previous marker to this one */
.rail-step + .rail-step::before { content: ""; position: absolute; top: 13px; left: calc(-50% + 22px); right: calc(50% + 22px); border-top: 1.5px dashed var(--line-strong); }
.rail-step.is-done + .rail-step::before { border-top-style: solid; border-color: var(--accent); }
.rail-link { display: grid; justify-items: center; gap: var(--s-2); padding: 0 var(--s-1) var(--s-2); text-align: center; color: inherit; text-decoration: none; border-radius: var(--r-md); }
.rail-marker {
  display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%;
  border: 1.5px dashed var(--pencil); color: var(--pencil); background: var(--raised);
  font-size: var(--text-xs); font-weight: 600; font-variant-numeric: tabular-nums;
}
.is-done .rail-marker { border: 0; background: var(--accent); color: var(--accent-ink); }
.is-next .rail-marker { border: 2px solid var(--accent); color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
.rail-text { display: grid; gap: 2px; }
.rail-label { font-weight: 600; }
.rail-value { font-size: var(--text-sm); color: var(--muted); }
.rail-value b { color: var(--ink); font-variant-numeric: tabular-nums; }
.rail-link:hover .rail-label { color: var(--accent); }

.next { display: flex; gap: var(--s-4); align-items: center; justify-content: space-between; flex-wrap: wrap; padding: var(--s-4) var(--s-5); border-top: 1px solid var(--line); background: var(--surface); }
.next-text { flex: 1 1 320px; }
.next-kicker { font-size: var(--text-xs); font-weight: 600; color: var(--accent); }
.next h3 { margin: 2px 0 2px; font-size: var(--text-lg); }
.next p { margin: 0; color: var(--muted); max-width: 64ch; }

.home-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--s-5); align-items: start; margin-top: var(--s-5); }
.home-grid > .notice { grid-column: 1 / -1; }
.home-grid.solo { grid-template-columns: minmax(0, 1fr); }
.doc-link { font-weight: 500; color: var(--ink); text-decoration: none; }
.doc-link:hover { color: var(--accent); text-decoration: underline; }
.sources { position: sticky; top: var(--s-5); }
.source-option { display: grid; gap: var(--s-2); justify-items: start; }
.source-option + .source-option { padding-top: var(--s-4); border-top: 1px solid var(--line); }
.source-option h3 { margin: 0; font-size: var(--text-base); }
.source-option p { margin: 0; font-size: var(--text-sm); color: var(--muted); }
.notice + .home-grid, .workflow + .notice { margin-top: var(--s-4); }

@media (max-width: 1100px) {
  .home-grid { grid-template-columns: minmax(0, 1fr); }
  .sources { position: static; }
}
@media (max-width: 720px) {
  .rail { grid-template-columns: 1fr; padding: var(--s-4); gap: 0; }
  .rail-step + .rail-step::before { top: -10px; bottom: auto; height: 20px; left: 13px; right: auto; border-top: 0; border-left: 1.5px dashed var(--line-strong); }
  .rail-step.is-done + .rail-step::before { border-left-style: solid; border-color: var(--accent); }
  .rail-link { grid-template-columns: 28px 1fr; justify-items: start; align-items: center; text-align: left; gap: var(--s-3); padding: 6px 0; }
  .rail-text { grid-template-columns: 1fr auto; width: 100%; align-items: baseline; }
  .next { padding: var(--s-4); }
}
</style>
