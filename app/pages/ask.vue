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
const ASHBELL_EXAMPLES = [
  'Who rings the Ashbell at dusk?',
  'How long is the walk from the Bell Gate to Saltgate?',
  'What is Corin\'s favourite song?',
]
// The demo questions only fit a project holding that demo; elsewhere, ask about the project's own most-cited pages.
const { data: docs } = await useFetch('/api/documents')
const { data: entities } = await useEntityList()
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const fill = useFillAction()
const examples = computed(() => {
  if (docs.value?.some(d => d.filename === 'lore-chord-stone.md')) return DEMO_EXAMPLES
  if (docs.value?.some(d => d.filename === 'lore-the-ashbell.md')) return ASHBELL_EXAMPLES
  const cited = entities.value.filter(e => e.facts > 0).sort((a, b) => b.facts - a.facts)
  const who = cited.find(e => e.kind === 'character')
  const where = cited.find(e => e.kind === 'location')
  const top = cited.find(e => e !== who && e !== where)
  return [who && `Where is ${who.name}?`, where && `Who has been to ${placePhrase(where.name)}?`, top && `What do we know about ${top.name}?`].filter((q): q is string => !!q)
})

// Independent questions shown as a chat: /api/qa has no conversation memory, so each turn is answered on its own.
type Turn = { id: number, q: string, result?: Record<string, any>, error?: string }
const turns = ref<Turn[]>([])
let seq = 0

async function ask(q = question.value) {
  q = q.trim()
  if (!q || busy.value) return
  question.value = ''
  busy.value = true
  const turn = reactive<Turn>({ id: ++seq, q })
  turns.value.push(turn)
  scrollEnd()
  try {
    turn.result = await $fetch('/api/qa', { method: 'POST', body: { question: q } })
    refreshNuxtData('stats')
  } catch (e) {
    turn.error = errorMessage(e)
  } finally {
    busy.value = false
    scrollEnd()
  }
}
function scrollEnd() {
  nextTick(() => window.scrollTo({ top: document.documentElement.scrollHeight }))
}
// Enter and Ctrl/Cmd+Enter send; Shift+Enter (and IME composition) leave the newline alone.
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return
  e.preventDefault()
  ask()
}

const STATUS = {
  supported: { tone: 'good', label: 'Supported by canon', text: 'Answered from accepted canon. Check the sources below.' },
  source_only: { tone: 'warn', label: 'Related canon only', text: 'The model is offline, so no answer was written. These accepted facts look related; read them yourself.' },
  unknown: { tone: 'neutral', label: 'Unknown', text: 'No accepted canon fact answers this. Nothing was guessed.' },
} as const
const statusOf = (t: Turn) => STATUS[t.result?.status as keyof typeof STATUS]
</script>

<template>
  <UiPageHeader title="Ask the canon" description="Answers come only from accepted canon and cite their sources. If the canon doesn't support an answer, the result is “unknown”. Each question is answered on its own; earlier ones aren't remembered." />

  <UiPanel v-if="stats && !stats.canon && !turns.length">
    <UiEmptyState title="Nothing to ask yet" icon="ask">
      Answers come only from accepted canon, and this project has none yet. Once facts are accepted, ask about who, where and when.
      <template #actions><UiButton variant="primary" :icon="fill.icon" :to="fill.to">{{ fill.label }}</UiButton></template>
    </UiEmptyState>
  </UiPanel>
  <template v-else>
    <div class="chat" role="log" aria-live="polite" aria-label="Conversation">
      <div v-if="!turns.length" class="starter">
        <p class="muted">Ask about characters, places, rules or timing. Try one of these:</p>
        <div v-if="examples.length" class="examples">
          <button v-for="ex in examples" :key="ex" type="button" class="example" @click="ask(ex)">{{ ex }}</button>
        </div>
      </div>
      <template v-for="t in turns" :key="t.id">
        <p class="bubble me">{{ t.q }}</p>
        <div class="reply">
          <p v-if="!t.result && !t.error" class="bubble them faint" role="status">Searching the canon…</p>
          <p v-else-if="t.error" class="notice bad" role="alert">{{ t.error }}</p>
          <template v-else-if="t.result">
            <div class="verdict" :class="statusOf(t).tone" :data-status="t.result.status">
              <div class="verdict-head">
                <UiBadge :tone="statusOf(t).tone" dot>{{ statusOf(t).label }}</UiBadge>
                <span class="small muted">{{ t.result.model.label }} · <span class="mono">{{ t.result.trace_id }}</span></span>
              </div>
              <p v-if="t.result.answer" class="statement answer">{{ t.result.answer }}</p>
              <p v-if="t.result.model_error" class="notice bad" role="alert">{{ t.result.model_error }} The related facts below were found by keyword match, not by the model.</p>
              <p v-else-if="!t.result.answer" class="verdict-text">{{ statusOf(t).text }}</p>
            </div>
            <template v-if="t.result.cited.length">
              <h2 class="cited-title">{{ t.result.status === 'supported' ? 'Sources' : 'Related accepted facts' }} <span class="faint">{{ t.result.cited.length }}</span></h2>
              <UiPanel v-for="f in t.result.cited" :key="f.id" sunk>
                <FactSummary :fact="f" sources />
              </UiPanel>
            </template>
          </template>
        </div>
      </template>
    </div>

    <form class="composer" @submit.prevent="ask()">
      <textarea v-model="question" rows="1" aria-label="Question" placeholder="Ask the canon…" @keydown="onKey" />
      <UiButton type="submit" variant="primary" :disabled="busy || !question.trim()" :loading="busy">{{ busy ? 'Searching…' : 'Ask' }}</UiButton>
    </form>
  </template>
</template>

<style scoped>
.chat { display: grid; gap: var(--s-4); min-height: calc(100dvh - 20rem - var(--bottom-nav-h, 0px)); align-content: start; padding-bottom: var(--s-4); }
.starter { display: grid; gap: var(--s-3); padding: var(--s-5) 0; }
.starter p { margin: 0; }
.examples { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.example { font: inherit; font-size: var(--text-sm); color: var(--muted); background: var(--sunken); border: 1px solid var(--line); border-radius: var(--r-md); padding: 6px 10px; min-height: 34px; cursor: pointer; text-align: left; transition: color var(--dur-1) var(--ease); }
.example:hover { color: var(--ink); border-color: var(--line-strong); }
.bubble { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; padding: var(--s-2) var(--s-4); border-radius: var(--r-lg); }
.bubble.me { justify-self: end; max-width: min(80%, 60ch); background: var(--accent-soft, var(--sunken)); border: 1px solid var(--line-strong); font-weight: 500; }
.bubble.them { justify-self: start; }
.reply { display: grid; gap: var(--s-3); max-width: 80ch; }
.verdict { border: 1px solid var(--line); border-left-width: 4px; border-radius: var(--r-lg); background: var(--raised); padding: var(--s-4); display: grid; gap: var(--s-3); }
.verdict.good { border-left-color: var(--good); }
.verdict.warn { border-left-color: var(--warn); background: var(--warn-soft); }
.verdict.neutral { border-left-color: var(--faint); border-left-style: dashed; background: var(--sunken); }
.verdict-head { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); justify-content: space-between; align-items: center; }
.verdict-text { margin: 0; max-width: 70ch; }
.answer { margin: 0; }
.cited-title { margin: var(--s-2) 0 0; font-size: var(--text-md); }
.cited-title .faint { font-weight: 400; font-size: var(--text-sm); }
.composer { position: sticky; bottom: var(--bottom-nav-h, 0px); z-index: 5; display: flex; gap: var(--s-2); align-items: flex-end; padding: var(--s-3) 0; background: var(--bg); border-top: 1px solid var(--line); }
.composer textarea { flex: 1; min-height: 0; padding-block: 9px; min-width: 0; resize: none; field-sizing: content; max-height: 8lh; font: inherit; }
</style>
