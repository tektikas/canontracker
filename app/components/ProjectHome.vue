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
const { data: drafts } = await useFetch('/api/drafts', { default: () => [] })
const recordedMode = computed(() => stats.value?.model.mode === 'mock')
// The first source (the list holds latest versions only): where adding facts by hand starts.
const firstSource = computed(() => docs.value?.[0])
// The guided tour only fits the Broken Tide demo.
const demoLoaded = computed(() => !!docs.value?.some(d => d.filename === 'lore-chord-stone.md'))
const liveHelp = ref(false)
// No scan record in the API: a scan in this session (set on /conflicts) counts until new sources arrive.
const scanned = useState('conflicts-scanned', () => false)
const busy = ref<'' | 'demo'>('')
const error = ref('')
const results = ref<Record<string, any>[]>([])
const uploader = ref<{ pick: () => void }>()
const versionsTotal = computed(() => docs.value?.reduce((n, d) => n + d.version, 0) ?? 0)
const pendingTotal = computed(() => stats.value?.pending ?? 0)
const recentDocs = computed(() => [...(docs.value ?? [])].sort((a, b) => b.imported_at.localeCompare(a.imported_at)).slice(0, 6))

async function run(kind: 'demo', fn: () => Promise<{ results: Record<string, any>[] }>) {
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

async function loadDemo() {
  if (stats.value?.documents && !(await askConfirm({ title: `Replace everything in ${projectName.value}?`, body: 'The Broken Tide demo set takes its place. The audit trail keeps its history; other projects are not touched.', confirm: 'Replace with demo', danger: true }))) return
  run('demo', () => $fetch('/api/demo/load', { method: 'POST' }))
}

// Files dropped on Home or picked here go through the Library uploader (per-file progress and results).
async function uploaded() {
  scanned.value = false
  await Promise.all([refreshDocs(), refreshConflicts(), refreshNuxtData('stats'), refreshEntities()])
}

const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`
// "3 sources, 1 of them a scene" / "2 sources, both scenes" / "1 source, a scene"
const sourceLine = computed(() => {
  const n = stats.value?.documents ?? 0
  const k = stats.value?.scenes ?? 0
  const head = `${n} ${plural(n, 'source')}`
  if (!k) return head
  if (n === 1) return `${head}, a scene`
  if (k === n) return `${head}, ${n === 2 ? 'both' : 'all'} scenes`
  return `${head}, ${k} of them ${k === 1 ? 'a scene' : 'scenes'}`
})

// The workflow, in order. `done` reflects stored data only; the first step that isn't done is the next action.
const steps = computed(() => {
  const s = stats.value
  if (!s) return []
  const found = conflicts.value?.length ?? 0
  const runs = evals.value?.length ?? 0
  return [
    { key: 'import', label: 'Import', to: '/library', value: s.documents, caption: plural(s.documents, 'source'), done: s.documents > 0 },
    { key: 'review', label: 'Review', to: '/review', value: s.pending || null, caption: s.pending ? 'to review' : s.canon - s.sample_canon + s.rejected ? 'all reviewed' : s.documents ? 'none proposed' : 'nothing yet', done: s.documents > 0 && s.pending === 0 },
    { key: 'canon', label: 'Canon', to: '/canon', value: s.canon, caption: plural(s.canon, 'fact'), done: s.canon > 0 },
    { key: 'conflicts', label: 'Conflicts', to: '/conflicts', value: s.open_conflicts || null, caption: s.open_conflicts ? `open · ${s.open_hard} hard · ${s.open_soft} soft` : found || scanned.value ? 'none open' : s.canon ? 'none open · scan to check' : 'nothing yet', done: s.canon > 0 && s.open_conflicts === 0 && (found > 0 || scanned.value), skip: s.canon > 0 && s.open_conflicts === 0 },
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
      ? { title: 'Add your lore and scenes', text: admin.value ? 'Load the demo set, import Markdown and text files, or write a document here. Sources are stored read-only.' : 'Import Markdown and text files, or write a document here. Sources are stored read-only.' }
      : { title: 'No sources yet', text: 'An editor on your team imports lore and scenes. You will see them here as soon as they do.' }
    case 'review': return editor.value
      ? { title: `Review ${s?.pending} ${plural(s?.pending ?? 0, 'candidate')}`, text: 'The model proposed these facts with a quote. Nothing becomes canon until you accept it.', to: '/review', action: 'Start review' }
      : { title: `${s?.pending} ${plural(s?.pending ?? 0, 'candidate')} waiting for review`, text: 'The model proposed these facts with a quote. An editor on your team decides which become canon.', to: '/review', action: 'See candidates' }
    case 'canon': return s?.rejected
      ? { title: 'Nothing is canon yet', text: 'Every candidate was rejected. Add facts by hand from your sources, or check the rejected list.', to: '/review', action: 'Open review' }
      : !editor.value
        ? { title: 'Nothing is canon yet', text: 'No facts have been added from these sources yet. An editor on your team adds them; you’ll see them here as soon as they do.', to: '/library', action: 'Open the library' }
        : recordedMode.value
          ? { title: 'Add facts by hand', text: 'No model proposed facts from your sources: the recorded run only covers the Broken Tide demo files. Open a source, select the words that say something, and add them as a fact. Or use the live model to propose facts for you.', manual: true }
          : { title: 'Add facts by hand', text: 'The model found no facts it could quote from your sources. Open a source, select the words that say something, and add them as a fact.', manual: true }
    // only reachable with open conflicts: zero open is `done` or `skip`
    case 'conflicts': return editor.value
      ? { title: `Decide on ${s?.open_conflicts} possible ${plural(s?.open_conflicts ?? 0, 'conflict')}`, text: `${s?.open_hard} hard (breaks canon) and ${s?.open_soft} soft (worth a look). Start with the hard ones. Deciding never edits canon.`, to: '/conflicts', action: 'Resolve conflicts' }
      : { title: `${s?.open_conflicts} possible ${plural(s?.open_conflicts ?? 0, 'conflict')} open`, text: `${s?.open_hard} hard and ${s?.open_soft} soft. An editor on your team confirms or dismisses each one. Deciding never edits canon.`, to: '/conflicts', action: 'View conflicts' }
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
      {{ sourceLine }}.
      <template v-if="stats.sample_canon">Canon here is the sample’s preloaded facts, labelled as such, plus any a person accepts; each is tied to its exact passage.</template>
      <template v-else>Canon holds only facts a person accepted, each tied to its exact passage.</template>
    </template>
    <template v-else-if="editor">
      Import or write lore and scenes. The model proposes facts with a quote, or you add them from the text yourself; only facts a person accepts become canon.
    </template>
    <template v-else>
      Your team’s lore and scenes show up here. Canon holds only facts a person accepted, each tied to its exact passage.
    </template>
  </UiPageHeader>

  <p v-if="['recorded', 'mixed'].includes(provenance(stats?.data_model_id).kind)" class="notice warn home-notice">
    <span><b>Recorded run.</b> Candidates and model checks are replayed from a recorded extraction, not a live model call.</span>
  </p>

  <GettingStarted v-if="editor" :demo="demoLoaded" />

  <section id="workflow" class="panel flush workflow" aria-labelledby="workflow-title">
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
          <UiButton v-if="editor" :variant="admin ? 'secondary' : 'primary'" icon="upload" :disabled="!!busy" @click="uploader?.pick()">Import files</UiButton>
          <UiButton v-if="editor" icon="review" to="/write">Write a document</UiButton>
        </template>
        <template v-else-if="'manual' in next">
          <UiButton v-if="firstSource" variant="primary" icon="canon" :to="`/documents/${firstSource.id}`">Add facts by hand</UiButton>
          <UiButton v-if="recordedMode" :aria-expanded="liveHelp" @click="liveHelp = !liveHelp">Use the live model</UiButton>
        </template>
        <UiButton v-else variant="primary" :to="next.to">{{ next.action }}<UiIcon name="arrow" :size="16" /></UiButton>
      </div>
      <p v-if="liveHelp && 'manual' in next" class="live-help small">
        The live model (Muse Spark via the Meta Model API) reads your own files and proposes facts, each with a quote, for you to review.
        It is turned on where Story Bible is hosted, with the studio’s Meta Model API key. Once it’s on, import a file or save a document again and its candidates show up in Review.
      </p>
    </div>
  </section>

  <p v-if="busy" class="notice info" role="status">Loading the demo set and extracting candidates…</p>
  <p v-if="error" class="notice bad" role="alert">{{ error }}</p>

  <div class="home-grid" :class="{ solo: !editor || nextKey === 'import' }">
    <div class="stack" style="gap: var(--s-5)">
      <LibraryUpload v-if="editor" ref="uploader" @uploaded="uploaded" />
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
                    ? 'No candidates: the recorded run only covers the Broken Tide demo files. Open the file to add facts by hand, or use the live model.'
                    : stats?.model.mode === 'meta' ? 'No candidates: the model found no facts it could quote from this file. Open it to add facts by hand.'
                      : 'No candidates were proposed from this file. Open it to add facts by hand.' }}</div>
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

      <UiPanel v-if="drafts.length" title="Your drafts" description="Not part of the story until you save them. Only you see these." flush>
        <ul class="drafts">
          <li v-for="d in drafts" :key="d.id">
            <NuxtLink :to="`/write?draft=${d.id}`" class="doc-link">{{ d.title || 'Untitled' }}</NuxtLink>
            <span class="small faint">{{ d.document_id ? 'Edits a saved document' : 'New document' }} · {{ dateTime(d.updated_at) }}</span>
          </li>
        </ul>
      </UiPanel>

      <UiPanel title="Library" :description="docs?.length ? 'Your sources, read-only. Folders, tags, version history and what changed between versions.' : undefined">
        <template v-if="docs?.length" #actions><UiButton size="sm" icon="library" to="/library">Open the library</UiButton></template>
        <UiEmptyState v-if="!docs?.length" icon="library" title="No sources yet">
          {{ editor ? 'Start from the next step above, or drop files anywhere on this page.' : 'Nothing has been added to this project yet.' }}
        </UiEmptyState>
        <template v-else>
          <p class="small library-counts">
            <b>{{ docs.length }}</b> {{ plural(docs.length, 'document') }} · <b>{{ versionsTotal }}</b> {{ plural(versionsTotal, 'version') }}
            <template v-if="pendingTotal"> · <NuxtLink to="/review"><b>{{ pendingTotal }}</b> to review</NuxtLink></template>
          </p>
          <p v-if="stats?.recheck_outdated || stats?.recheck_unchanged" class="small library-stale">
            <UiIcon name="history" :size="14" /><NuxtLink to="/canon?recheck=1">Needs re-check: {{ stats.recheck_outdated ? counted(stats.recheck_outdated, 'canon fact') + ' with outdated evidence' : 'no outdated evidence' }}<template v-if="stats.recheck_unchanged">, {{ stats.recheck_unchanged }} unchanged to confirm</template></NuxtLink> after a source changed.
          </p>
          <ul class="recent" aria-label="Recently changed documents">
            <li v-for="d in recentDocs" :key="d.id">
              <NuxtLink :to="`/documents/${d.id}`" class="recent-main">
                <UiIcon :name="docKind(d.kind).icon" :size="16" class="faint" />
                <span class="recent-title">{{ d.title }}</span>
              </NuxtLink>
              <span class="recent-meta small faint">{{ docKind(d.kind).label }} · v{{ d.version }} · {{ shortDate(d.imported_at) }}<template v-if="d.created_by_name"> · {{ d.created_by_name }}</template></span>
            </li>
          </ul>
          <p v-if="docs.length > recentDocs.length" class="small faint recent-more">Latest {{ recentDocs.length }} of {{ docs.length }}. <NuxtLink to="/library">See all</NuxtLink></p>
        </template>
      </UiPanel>
    </div>

    <!-- With no sources yet, the next step above already offers every way in. -->
    <UiPanel v-if="editor && nextKey !== 'import'" id="sources" title="Add sources" as="aside" class="sources">
      <div class="stack">
        <div v-if="admin" class="source-option">
          <h3>Broken Tide demo</h3>
          <p>An original island story: 2 lore documents and 11 scenes. Loading it replaces everything in {{ projectName }} except the audit trail; other projects are not touched.</p>
          <UiButton icon="demo" :loading="busy === 'demo'" :disabled="!!busy" @click="loadDemo">Load demo set</UiButton>
        </div>
        <div class="source-option">
          <h3>Write it here</h3>
          <p>Write or paste a scene. Drafts save as you type; each save to the story is a new read-only version.</p>
          <UiButton icon="review" to="/write">New document</UiButton>
        </div>
        <div class="source-option">
          <h3>Your files</h3>
          <p>Markdown or plain text, up to 1 MB each. Files are stored as they are and never edited. The model then proposes candidate facts into Review; nothing becomes canon until a person accepts it. An unchanged file is skipped; a changed one becomes a new version.</p>
          <UiButton icon="upload" :disabled="!!busy" @click="uploader?.pick()">Import files</UiButton>
          <p class="small faint">Or drop files anywhere on this page.</p>
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
.live-help { flex: 1 1 100%; margin: 0; padding: var(--s-3); border: 1px dashed var(--line-strong); border-radius: var(--r-md); color: var(--muted); max-width: 72ch; }
.drafts { list-style: none; margin: 0; padding: 0; }
.drafts li { display: flex; flex-wrap: wrap; gap: 2px var(--s-3); align-items: baseline; justify-content: space-between; padding: 10px var(--s-5); border-top: 1px solid var(--line); }
.drafts li:first-child { border-top: 0; }
.library-counts { margin: 0 0 var(--s-2); color: var(--muted); }
.library-counts b { color: var(--ink); font-variant-numeric: tabular-nums; }
.recent { list-style: none; margin: var(--s-3) 0 0; padding: 0; border-top: 1px solid var(--line); }
.recent li { display: flex; flex-wrap: wrap; gap: 2px var(--s-4); align-items: baseline; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--line); }
.recent-main { display: flex; gap: var(--s-2); align-items: center; min-width: 0; color: var(--ink); text-decoration: none; font-weight: 500; }
.recent-main:hover { color: var(--accent); text-decoration: underline; }
.recent-title { overflow-wrap: anywhere; }
.recent-more { margin: var(--s-3) 0 0; }
.library-stale { margin: 0 0 var(--s-2); color: var(--warn); }
.library-stale svg { vertical-align: -2px; margin-right: 6px; }
.library-stale a { color: var(--warn); }

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
