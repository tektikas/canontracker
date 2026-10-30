<script setup lang="ts">
const question = ref('')
const result = ref<Record<string, any> | null>(null)
const busy = ref(false)
const error = ref('')
const examples = [
  'Why can\'t Leya remember an hour of Day 1?',
  'Where is Arin at 22:00 on Day 1?',
  'What did the harbor master eat on Day 3?',
]

async function ask(q = question.value) {
  question.value = q
  if (!q.trim()) return
  busy.value = true
  error.value = ''
  try {
    result.value = await $fetch('/api/qa', { method: 'POST', body: { question: q } })
    refreshNuxtData('stats')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

const STATUS = {
  supported: { chip: 'good', label: 'Supported by canon' },
  source_only: { chip: 'warn', label: 'Related canon only, no generated answer' },
  unknown: { chip: 'bad', label: 'Unknown: not enough evidence' },
} as const
</script>

<template>
  <div class="page-head">
    <h1>Ask the canon</h1>
    <p>Answers come only from accepted canon and cite their sources. If the canon doesn't support an answer, the result is "unknown".</p>
  </div>

  <form class="card stack" @submit.prevent="ask()">
    <label>Question<input v-model="question" type="text" placeholder="Ask about characters, places, rules, timing…"></label>
    <div class="spread">
      <div class="row">
        <button v-for="ex in examples" :key="ex" type="button" class="chip" style="border: 0; cursor: pointer" @click="ask(ex)">{{ ex }}</button>
      </div>
      <button class="btn primary" :disabled="busy || !question.trim()">{{ busy ? 'Searching…' : 'Ask' }}</button>
    </div>
  </form>

  <p v-if="error" class="notice bad" role="alert" style="margin-top: 14px">{{ error }}</p>

  <section v-if="result" class="card stack" style="margin-top: 18px" aria-live="polite">
    <div class="spread">
      <span class="chip" :class="STATUS[result.status as keyof typeof STATUS].chip">{{ STATUS[result.status as keyof typeof STATUS].label }}</span>
      <span class="small muted">{{ result.model.label }} · <span class="mono">{{ result.trace_id }}</span></span>
    </div>
    <p v-if="result.answer" class="statement">{{ result.answer }}</p>
    <p v-else-if="result.status === 'unknown'" class="muted">No accepted canon fact answers this. Nothing was guessed.</p>
    <p v-else class="muted">The model is offline, so no answer was written. These accepted facts look related:</p>
    <div v-for="f in result.cited" :key="f.id" class="card" style="background: var(--bg)">
      <FactSummary :fact="f" sources />
    </div>
  </section>
</template>
