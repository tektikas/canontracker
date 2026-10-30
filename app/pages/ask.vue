<script setup lang="ts">
const question = ref('')
const result = ref<Record<string, any> | null>(null)
const asked = ref('')
const busy = ref(false)
const error = ref('')
const DEMO_EXAMPLES = [
  'Why can\'t Leya remember an hour of Day 1?',
  'Where is Arin at 22:00 on Day 1?',
  'What did the harbor master eat on Day 3?',
]
// The Broken Tide questions only fit a project holding the demo; elsewhere, ask about the project's own most-cited pages.
const { data: docs } = await useFetch('/api/documents')
const { data: entities } = await useEntityList()
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const fill = useFillAction()
const examples = computed(() => {
  if (docs.value?.some(d => d.filename === 'lore-chord-stone.md')) return DEMO_EXAMPLES
  const cited = entities.value.filter(e => e.facts > 0).sort((a, b) => b.facts - a.facts)
  const who = cited.find(e => e.kind === 'character')
  const where = cited.find(e => e.kind === 'location')
  const top = cited.find(e => e !== who && e !== where)
  return [who && `Where is ${who.name}?`, where && `Who has been to ${placePhrase(where.name)}?`, top && `What do we know about ${top.name}?`].filter((q): q is string => !!q)
})

async function ask(q = question.value) {
  question.value = q
  if (!q.trim()) return
  busy.value = true
  error.value = ''
  try {
    result.value = await $fetch('/api/qa', { method: 'POST', body: { question: q } })
    asked.value = q
    refreshNuxtData('stats')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

const STATUS = {
  supported: { tone: 'good', label: 'Supported by canon', text: 'Answered from accepted canon. Check the sources below.' },
  source_only: { tone: 'warn', label: 'Related canon only', text: 'The model is offline, so no answer was written. These accepted facts look related; read them yourself.' },
  unknown: { tone: 'neutral', label: 'Unknown', text: 'No accepted canon fact answers this. Nothing was guessed.' },
} as const
const status = computed(() => result.value ? STATUS[result.value.status as keyof typeof STATUS] : null)
</script>

<template>
  <UiPageHeader title="Ask the canon" description="Answers come only from accepted canon and cite their sources. If the canon doesn't support an answer, the result is “unknown”." />

  <UiPanel v-if="stats && !stats.canon && !result">
    <UiEmptyState title="Nothing to ask yet" icon="ask">
      Answers come only from accepted canon, and this project has none yet. Once facts are accepted, ask about who, where and when.
      <template #actions><UiButton variant="primary" :icon="fill.icon" :to="fill.to">{{ fill.label }}</UiButton></template>
    </UiEmptyState>
  </UiPanel>
  <UiPanel v-else>
    <form class="ask-form" @submit.prevent="ask()">
      <UiField label="Question">
        <div class="ask-input">
          <input v-model="question" type="text" placeholder="Ask about characters, places, rules, timing…">
          <UiButton type="submit" variant="primary" :disabled="busy || !question.trim()" :loading="busy">{{ busy ? 'Searching…' : 'Ask' }}</UiButton>
        </div>
      </UiField>
      <div v-if="examples.length" class="examples">
        <span class="faint small">Try</span>
        <button v-for="ex in examples" :key="ex" type="button" class="example" @click="ask(ex)">{{ ex }}</button>
      </div>
    </form>
  </UiPanel>

  <p v-if="error" class="notice bad" role="alert" style="margin-top: var(--s-4)">{{ error }}</p>

  <section v-if="result && status" class="result" aria-live="polite">
    <p class="asked"><span class="faint">You asked</span> {{ asked }}</p>
    <div class="verdict" :class="status.tone" :data-status="result.status">
      <div class="verdict-head">
        <UiBadge :tone="status.tone" dot>{{ status.label }}</UiBadge>
        <span class="small muted">{{ result.model.label }} · <span class="mono">{{ result.trace_id }}</span></span>
      </div>
      <p v-if="result.answer" class="statement answer">{{ result.answer }}</p>
      <p v-if="result.model_error" class="notice bad" role="alert">{{ result.model_error }} The related facts below were found by keyword match, not by the model.</p>
      <p v-else-if="!result.answer" class="verdict-text">{{ status.text }}</p>
    </div>

    <template v-if="result.cited.length">
      <h2 class="cited-title">{{ result.status === 'supported' ? 'Sources' : 'Related accepted facts' }} <span class="faint">{{ result.cited.length }}</span></h2>
      <UiPanel v-for="f in result.cited" :key="f.id" sunk>
        <FactSummary :fact="f" sources />
      </UiPanel>
    </template>
  </section>
</template>

<style scoped>
.ask-form { display: grid; gap: var(--s-3); }
.ask-input { display: flex; gap: var(--s-2); }
.ask-input input { flex: 1; min-width: 0; }
.examples { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.example { font: inherit; font-size: var(--text-sm); color: var(--muted); background: var(--sunken); border: 1px solid var(--line); border-radius: var(--r-md); padding: 6px 10px; min-height: 34px; cursor: pointer; text-align: left; transition: color var(--dur-1) var(--ease); }
.example:hover { color: var(--ink); border-color: var(--line-strong); }
.result { display: grid; gap: var(--s-4); margin-top: var(--s-5); }
.asked { margin: 0; font-weight: 500; overflow-wrap: anywhere; }
.verdict { border: 1px solid var(--line); border-left-width: 4px; border-radius: var(--r-lg); background: var(--raised); padding: var(--s-4); display: grid; gap: var(--s-3); }
.verdict.good { border-left-color: var(--good); }
.verdict.warn { border-left-color: var(--warn); background: var(--warn-soft); }
.verdict.neutral { border-left-color: var(--faint); border-left-style: dashed; background: var(--sunken); }
.verdict-head { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); justify-content: space-between; align-items: center; }
.verdict-text { margin: 0; max-width: 70ch; }
.answer { margin: 0; }
.cited-title { margin: var(--s-2) 0 0; font-size: var(--text-md); }
.cited-title .faint { font-weight: 400; font-size: var(--text-sm); }
@media (max-width: 520px) { .ask-input { flex-direction: column; } }
@media (max-width: 720px) { .example { min-height: 44px; } }
</style>
