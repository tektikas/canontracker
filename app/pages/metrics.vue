<script setup lang="ts">
// Viewers read only; the server refuses their writes too (server/middleware/access.ts).
const editor = computed(() => canEdit(useMe().value))
const { data: runs, refresh } = await useFetch('/api/eval')
const { data: calls, refresh: refreshCalls } = await useFetch('/api/model-calls')
const busy = ref(false)
const error = ref('')
const latest = computed(() => runs.value?.[0])
// The gold sets are the demo stories' (Broken Tide, The Ashbell Pass); elsewhere a run would only score a story it doesn't describe.
const { data: docs } = await useFetch('/api/documents')
const demo = computed(() => !!docs.value?.some(d => d.filename === 'lore-chord-stone.md' || d.filename === 'lore-the-ashbell.md'))

async function run() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/eval', { method: 'POST' })
  } catch (e) {
    error.value = errorMessage(e)
    return
  } finally {
    busy.value = false
  }
  refresh()
  refreshCalls()
  refreshNuxtData('stats')
}

type Tone = 'good' | 'bad' | 'neutral'
const verdict = (pass: boolean | null): { tone: Tone, label: string } => pass === null ? { tone: 'neutral', label: 'Info' } : pass ? { tone: 'good', label: 'Met' } : { tone: 'bad', label: 'Missed' }
const score = (results: { pass: boolean | null }[]) => ({
  met: results.filter(r => r.pass === true).length,
  missed: results.filter(r => r.pass === false).length,
  info: results.filter(r => r.pass === null).length,
})
const s = computed(() => latest.value ? score(latest.value.results) : null)
const tone = (id: string) => ({ recorded: 'warn', live: 'good', mixed: 'pencil', none: 'neutral' } as const)[provenance(id).kind]
</script>

<template>
  <UiPageHeader title="Measurements">
    <template #actions>
      <UiButton v-if="editor && (demo || latest)" variant="primary" :loading="busy" :disabled="busy" @click="run">{{ busy ? 'Measuring…' : 'Run evaluation' }}</UiButton>
    </template>
    Targets from the MVP acceptance list, measured on the current data.
  </UiPageHeader>

  <p class="notice info caveat">
    <UiIcon name="metrics" :size="16" />
    <span>The gold set is small, hand-labeled and synthetic (Broken Tide or The Ashbell Pass, whichever this project loaded). It checks that the system behaves as designed; it is not evidence of real-world accuracy.</span>
  </p>

  <p v-if="error" class="notice bad" role="alert" style="margin-bottom: var(--s-4)">{{ error }}</p>

  <UiEmptyState v-if="!latest && demo" title="Not run yet" icon="metrics">
    For a full run: review candidates, scan conflicts and decide A1, then run the evaluation. It scores the data as it is now.
    <template v-if="editor" #actions><UiButton variant="primary" :loading="busy" @click="run">Run evaluation</UiButton></template>
  </UiEmptyState>
  <UiEmptyState v-else-if="!latest" title="Measured on the demo story" icon="metrics">
    The targets are scored against a hand-labeled gold set for a demo story (Broken Tide or The Ashbell Pass), so this project has nothing to measure.
    Load the demo into a project of its own to see a run.
    <template #actions><UiButton variant="primary" icon="folder" to="/settings/projects">Open projects</UiButton></template>
  </UiEmptyState>

  <template v-else-if="s">
    <section class="score" aria-label="Latest run summary">
      <div class="score-main">
        <span class="score-num"><b>{{ s.met }}</b> of {{ s.met + s.missed }}</span>
        <span class="score-label">targets met<template v-if="s.missed"> · <span class="missed">{{ s.missed }} missed</span></template><template v-if="s.info"> · {{ s.info }} info</template></span>
      </div>
      <div class="bar" role="img" :aria-label="`${s.met} met, ${s.missed} missed, ${s.info} info`">
        <i v-for="(r, i) in latest!.results" :key="i" :class="verdict(r.pass).tone" />
      </div>
      <div class="score-meta small muted">
        {{ dateTime(latest!.created_at) }} · dataset <span class="mono">{{ latest!.dataset }}</span> ·
        scored data: <UiBadge :tone="tone(latest!.model_id)" dot>{{ provenance(latest!.model_id).label }}</UiBadge>
        <span class="faint">Scores the database as it is now. Ask checks run against accepted canon, with no model call in the scoring.</span>
      </div>
    </section>

    <UiPanel flush title="Latest run" class="gap">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Measure</th><th>Target</th><th>Measured</th><th>Result</th></tr></thead>
          <tbody>
            <tr v-for="m in latest!.results" :key="m.key">
              <td class="measure">{{ m.label }}<div v-if="m.note" class="small muted">{{ m.note }}</div></td>
              <td class="mono small" data-l="Target">{{ m.target }}</td>
              <td class="mono small" data-l="Measured">{{ m.measured }}</td>
              <td data-l="Result"><UiBadge :tone="verdict(m.pass).tone" :dot="m.pass !== null">{{ verdict(m.pass).label }}</UiBadge></td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiPanel>

    <UiPanel v-if="runs && runs.length > 1" title="Earlier runs" class="gap">
      <ul class="runs small">
        <li v-for="r in runs.slice(1)" :key="r.id">
          <span>{{ dateTime(r.created_at) }}</span>
          <b>{{ score(r.results).met }} met · {{ score(r.results).missed }} missed</b>
          <UiBadge :tone="tone(r.model_id)">{{ provenance(r.model_id).label }}</UiBadge>
        </li>
      </ul>
    </UiPanel>
  </template>

  <UiPanel flush title="Model calls" description="Every call to the model (Meta Model API, Muse Spark, or the recorded demo run): what it was for, which sources it saw, how long it took. Prompts, keys and full documents are not stored." class="gap">
    <p v-if="!calls?.length" class="empty-note muted">No model calls yet.</p>
    <div v-else class="table-wrap">
      <table>
        <thead><tr><th>Time</th><th>Purpose</th><th>Model · prompt</th><th class="hide-sm">Inputs</th><th>Result</th><th class="hide-sm">Latency</th></tr></thead>
        <tbody>
          <tr v-for="c in calls" :key="c.id">
            <td class="mono small nowrap">{{ clock(c.created_at) }}</td>
            <td><UiBadge tone="accent">{{ c.purpose.replace('_', ' ') }}</UiBadge></td>
            <td>
              <UiBadge :tone="tone(c.model_id)" dot>{{ provenance(c.model_id).label }}</UiBadge>
              <div class="mono small muted">{{ c.model_id }} · {{ c.prompt_version }}</div>
            </td>
            <td class="small hide-sm">{{ c.input_refs.length }} {{ c.target_type === 'document' ? 'document' : 'facts' }}</td>
            <td class="small">
              <span v-if="c.status === 'ok'">{{ c.output_summary }}</span>
              <UiBadge v-else tone="bad" :title="c.error ?? ''">Failed</UiBadge>
              <div v-if="c.status !== 'ok' && c.error" class="small muted">{{ c.error }}</div>
            </td>
            <td class="mono small hide-sm nowrap">{{ c.latency_ms }} ms</td>
          </tr>
        </tbody>
      </table>
    </div>
  </UiPanel>
</template>

<style scoped>
.caveat { margin-bottom: var(--s-5); align-items: center; }
.gap { margin-top: var(--s-5); }
.nowrap { white-space: nowrap; }
.score { border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--raised); padding: var(--s-5); display: grid; gap: var(--s-4); }
.score-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s-2) var(--s-4); }
.score-num { font-size: var(--text-xl); }
.score-num b { font-size: var(--text-2xl); font-weight: 600; }
.score-label { color: var(--muted); }
.missed { color: var(--bad); font-weight: 600; }
.bar { display: flex; gap: 3px; }
.bar i { flex: 1; height: 10px; border-radius: 2px; background: var(--line-strong); }
.bar i.good { background: var(--good); }
.bar i.bad { background: var(--bad); }
.score-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); }
.runs { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
.runs li { display: flex; flex-wrap: wrap; gap: var(--s-1) var(--s-3); align-items: center; }
@media (max-width: 500px) {
  .score { padding: var(--s-4); }
  .score-meta { display: block; line-height: 2; }
  .score-meta .mono { overflow-wrap: anywhere; }
  .measure { display: block; }
  tr:has(.measure) { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--s-1) var(--s-3); padding: var(--s-3) var(--s-4); }
  tr:has(.measure) td { display: block; padding: 0; border: 0; }
  tr:has(.measure) .measure { grid-column: 1 / -1; }
  tr:has(.measure) td[data-l]::before { content: attr(data-l); display: block; font-size: var(--text-xs, 11px); color: var(--faint); font-family: inherit; }
  tr:has(.measure) { border-top: 1px solid var(--line); }
  thead:has(+ tbody .measure) { display: none; }
}
.empty-note { margin: 0; padding: var(--s-4); }
</style>
