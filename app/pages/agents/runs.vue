<script setup lang="ts">
// Agent activity ("receipts"): every AI run in the project with its model, prompt version and effort, each step it took (tool,
// arguments, result, time, tokens), and what people did with it afterwards. ?run=<id> opens one run with its full step inputs;
// "How was this made?" links land here. Like Metrics, this is the developer view: it names the model.
useHead({ title: 'Agent activity · CanonTracker' })
const route = useRoute()
const one = computed(() => (typeof route.query.run === 'string' ? route.query.run : ''))
const purpose = ref('')
const { data: runs, pending, error } = await useFetch('/api/agents/runs', { query: computed(() => (one.value ? { run: one.value } : purpose.value ? { purpose: purpose.value } : {})) })

const AGENTS = [['', 'All agents'], ['extract', 'Extractor'], ['critic', 'Critic'], ['research', 'Research'], ['continuity', 'Continuity'], ['answer', 'Ask'], ['rule_check', 'Rule check'], ['image', 'Images'], ['transcribe', 'Transcribe']] as const
const FACT_WORDS: Record<string, string> = { canon: 'accepted', superseded: 'accepted, later superseded', rejected: 'rejected', pending: 'waiting in Review' }
const CONFLICT_WORDS: Record<string, string> = { open: 'open', confirmed: 'confirmed', false_positive: 'false alarm', uncertain: 'uncertain', resolved_by_merge: 'resolved by a merge' }
type Run = NonNullable<typeof runs.value>[number]
function outcome(r: Run) {
  const o = r.outcome
  if (!o) return r.purpose === 'answer' ? 'An answer to read; nothing to decide' : '—'
  const [map, words, none] = o.facts ? [o.facts, FACT_WORDS, r.purpose === 'continuity' ? 'Nothing sent to Review' : r.purpose === 'research' ? 'Not promoted' : 'No candidates'] as const
    : [o.conflicts!, CONFLICT_WORDS, 'No conflicts raised'] as const
  const parts = Object.entries(map).map(([k, n]) => `${n} ${words[k] ?? k}`)
  return parts.length ? `${r.purpose === 'rule_check' ? 'Conflicts' : 'Candidates'}: ${parts.join(' · ')}` : none
}
const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
const what = (s: Run['steps'][number]) => (s.tool === null ? 'AI' : s.tool === 'web_search' ? 'AI + web search' : s.tool)
const link = (r: Run) => (r.purpose === 'research' ? { to: `/research/${r.target_id}`, label: 'Open the research note' }
  : r.target_type === 'document' ? { to: `/documents/${r.target_id}`, label: 'Open the document' } : null)

// A continuity run's report, loaded when its row is opened.
const reports = ref<Record<string, Record<string, any> | string>>({})
async function loadReport(r: Run) {
  if (r.purpose !== 'continuity' || r.status !== 'ok' || reports.value[r.id]) return
  try {
    reports.value[r.id] = await $fetch(`/api/continuity/${r.id}`)
  } catch (e) {
    reports.value[r.id] = errorMessage(e)
  }
}
watch(runs, (list) => { if (one.value && list?.[0]) loadReport(list[0]) }, { immediate: true })
</script>

<template>
  <UiPageHeader title="Agent activity">
    <template #actions>
      <UiButton v-if="one" to="/agents/runs" variant="ghost" icon="arrow">All runs</UiButton>
      <label v-else class="filter"><span class="sr-only">Agent</span>
        <select v-model="purpose"><option v-for="[v, l] in AGENTS" :key="v" :value="v">{{ l }}</option></select>
      </label>
    </template>
    Every AI run in this project: which agent, the model and prompt version, each step it took, and what people did with the result.
  </UiPageHeader>

  <p v-if="error" class="notice bad" role="alert">{{ errorMessage(error) }}</p>
  <UiEmptyState v-else-if="!pending && !runs?.length" :title="one ? 'No AI run recorded for this' : 'No AI runs yet'" icon="history">
    <template v-if="one">Nothing was sent to the AI for it: canon search found no facts to answer from, or the run is no longer here.</template>
    <template v-else>Runs appear here as the AI extracts candidates, answers questions, researches and checks continuity.</template>
  </UiEmptyState>

  <ol v-else class="runs">
    <li v-for="r in runs" :key="r.id">
      <details class="run" :class="{ failed: r.status === 'failed' }" :open="!!one" @toggle="($event.target as HTMLDetailsElement).open && loadReport(r)">
        <summary>
          <span class="run-main">
            <UiBadge tone="accent">{{ r.agent }}</UiBadge>
            <span class="small muted nowrap" :title="dateTime(r.started_at)">{{ timeAgo(r.started_at) }}</span>
            <UiBadge v-if="r.status === 'failed'" tone="bad" dot>Failed</UiBadge>
            <span v-if="r.about" class="about">{{ r.about }}</span>
          </span>
          <span class="small faint run-meta">
            <span class="outcome" :class="{ bad: r.status === 'failed' }">{{ r.status === 'failed' ? r.error : outcome(r) }}</span> ·
            {{ r.model_steps }} AI step{{ r.model_steps === 1 ? '' : 's' }}<template v-if="r.tool_calls"> · {{ r.tool_calls }} tool call{{ r.tool_calls === 1 ? '' : 's' }}</template>
            · {{ secs(r.latency_ms) }}<template v-if="r.tokens"> · {{ r.tokens.toLocaleString('en') }} tokens</template>
          </span>
        </summary>

        <div class="run-body">
          <dl class="facts small">
            <div><dt>Model</dt><dd class="mono">{{ r.model_id }}</dd></div>
            <div><dt>Prompt</dt><dd class="mono">{{ r.prompt_version }}</dd></div>
            <div><dt>Effort</dt><dd>{{ r.effort ?? 'default' }}</dd></div>
            <div><dt>For</dt><dd><span class="mono">{{ r.target_type }} {{ r.target_id }}</span> <NuxtLink v-if="link(r)" :to="link(r)!.to">{{ link(r)!.label }}</NuxtLink></dd></div>
            <div><dt>Afterwards</dt><dd>{{ outcome(r) }}</dd></div>
          </dl>

          <div class="table-wrap">
            <table class="steps">
              <thead><tr><th scope="col">Step</th><th scope="col">What</th><th scope="col">Input</th><th scope="col">Result</th><th scope="col" class="nowrap">Time · tokens</th></tr></thead>
              <tbody>
                <tr v-for="s in r.steps" :key="s.id" :class="{ failed: s.status === 'failed' }">
                  <td class="mono" data-l="Step">{{ s.step == null ? 1 : s.step + 1 }}</td>
                  <td data-l="What"><span :class="{ mono: s.tool && s.tool !== 'web_search' }">{{ what(s) }}</span></td>
                  <td data-l="Input" class="io"><span v-if="s.input" class="mono small">{{ s.input }}</span><span v-else-if="s.inputs" class="small muted">{{ s.inputs }} source{{ s.inputs === 1 ? '' : 's' }}</span></td>
                  <td data-l="Result" class="io small">{{ s.error ?? s.result }}</td>
                  <td data-l="Time" class="mono small nowrap">{{ secs(s.latency_ms) }}<template v-if="s.tokens"> · {{ s.tokens.toLocaleString('en') }}</template></td>
                </tr>
              </tbody>
            </table>
          </div>

          <template v-if="r.purpose === 'continuity' && r.status === 'ok'">
            <p v-if="!reports[r.id]" class="small faint">Opening the report…</p>
            <p v-else-if="typeof reports[r.id] === 'string'" class="notice bad">{{ reports[r.id] }}</p>
            <ContinuityReport v-else :report="reports[r.id] as Record<string, any>" />
          </template>
        </div>
      </details>
    </li>
  </ol>
</template>

<style scoped>
.filter select { min-height: 36px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.runs { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
.run { border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--raised); min-width: 0; }
.run.failed { border-left: 3px solid var(--bad); }
.run > summary { display: flex; flex-wrap: wrap; gap: var(--s-1) var(--s-4); align-items: center; justify-content: space-between; padding: var(--s-3) var(--s-4); cursor: pointer; list-style: none; }
.run > summary::-webkit-details-marker { display: none; }
.run-main { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; min-width: 0; }
.outcome { overflow-wrap: anywhere; color: var(--muted); }
.outcome.bad { color: var(--bad); }
.about { font-weight: 500; overflow-wrap: anywhere; min-width: 0; }
.run-meta { font-variant-numeric: tabular-nums; }
.run-body { display: grid; gap: var(--s-4); padding: 0 var(--s-4) var(--s-4); border-top: 1px solid var(--line); padding-top: var(--s-3); min-width: 0; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--s-2) var(--s-4); margin: 0; }
.facts div { display: grid; gap: 2px; min-width: 0; }
.facts dt { color: var(--faint); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.02em; font-weight: 600; }
.facts dd { margin: 0; overflow-wrap: anywhere; }
.steps { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.steps th, .steps td { text-align: left; padding: 6px 4px; border-bottom: 1px solid var(--line); vertical-align: top; }
.steps .io { overflow-wrap: anywhere; max-width: 36ch; }
.steps tr.failed td { color: var(--bad); }
.nowrap { white-space: nowrap; }
@media (max-width: 720px) {
  .steps thead { display: none; }
  .steps tr { display: grid; grid-template-columns: auto 1fr; gap: 2px var(--s-3); padding: var(--s-2) 0; border-bottom: 1px solid var(--line); }
  .steps td { display: block; padding: 0; border: 0; }
  .steps .io { grid-column: 1 / -1; max-width: none; }
  .steps td[data-l="Time"] { grid-column: 1 / -1; }
  .steps td.io:not(:empty)::before { content: attr(data-l) ': '; color: var(--faint); font-family: var(--font-ui); }
}
</style>
