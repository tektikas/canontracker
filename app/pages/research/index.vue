<script setup lang="ts">
// Research: real-world questions answered from outside sources and calculators, kept as notes. Never canon; a note becomes
// a candidate only when someone promotes it, and then it waits in Review like any other.
useHead({ title: 'Research · Story Bible' })
const route = useRoute()
const router = useRouter()
const me = useMe()
const canAsk = computed(() => me.value?.current?.role !== 'viewer')
const { data: notes, refresh } = await useFetch('/api/research', { default: () => [] })

type V = Verdict | 'all'
const verdict = computed<V>({
  get: () => (typeof route.query.verdict === 'string' && route.query.verdict in VERDICTS ? route.query.verdict as Verdict : 'all'),
  set: v => router.replace({ query: { ...route.query, verdict: v === 'all' ? undefined : v } }),
})
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const tabs = computed(() => [
  { value: 'all' as V, label: 'All', count: notes.value.length },
  ...(Object.keys(VERDICTS) as Verdict[]).map(v => ({ value: v as V, label: VERDICTS[v].label, count: notes.value.filter(n => n.verdict === v).length })),
])
const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return notes.value.filter(n => (verdict.value === 'all' || n.verdict === verdict.value) && (!q || `${n.question} ${n.answer}`.toLowerCase().includes(q)))
})

// Asking. A follow-up keeps the turns so far; answering it (a chip or typed text) continues the same question.
const question = ref(typeof route.query.ask === 'string' ? route.query.ask : '')
const turns = ref<{ role: 'user' | 'assistant', text: string }[]>([])
const followup = ref<{ question: string, options?: string[] } | null>(null)
const busy = ref(false)
const error = ref('')
const message = ref('')
async function ask(text = question.value) {
  const q = text.trim()
  if (!q || busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await $fetch('/api/research', { method: 'POST', body: { question: q, history: turns.value } })
    if (res.kind === 'followup') {
      turns.value.push({ role: 'user', text: q }, { role: 'assistant', text: res.text })
      followup.value = res.followup ?? { question: res.text }
      question.value = ''
      return
    }
    turns.value = []
    followup.value = null
    question.value = ''
    if (res.noteIds?.length) {
      await refresh()
      await navigateTo(`/research/${res.noteIds[0]}`)
    } else message.value = res.text
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
function restart() {
  turns.value = []
  followup.value = null
}
const ago = (iso: string) => shortDate(iso)
</script>

<template>
  <UiPageHeader title="Research">
    Ask how the real world works: science, history, crime scenes, travel. Answers cite outside sources and show the numbers. They are notes for your team, never canon.
  </UiPageHeader>

  <UiPanel v-if="canAsk" class="ask" as="form" @submit.prevent="ask()">
    <p class="kicker"><UiIcon name="research" :size="14" /> Research · outside sources, not canon</p>
    <template v-if="followup">
      <div class="followup" role="status">
        <p class="small faint">You asked: {{ turns.filter(t => t.role === 'user').map(t => t.text).join(' → ') }}</p>
        <p class="fq"><UiIcon name="ask" :size="16" /> {{ followup.question }}</p>
        <div v-if="followup.options?.length" class="chips">
          <button v-for="o in followup.options" :key="o" type="button" class="btn sm" :disabled="busy" @click="ask(o)">{{ o }}</button>
        </div>
      </div>
    </template>
    <label class="sr-only" for="rq">{{ followup ? 'Your answer' : 'Research question' }}</label>
    <textarea id="rq" v-model="question" rows="3" maxlength="2000" :disabled="busy"
      :placeholder="followup ? 'Or type your answer…' : 'e.g. Was there a full moon over London on 9 November 1888?'"
      @keydown.enter.exact.prevent="ask()" />
    <div class="spread">
      <span class="small faint">{{ busy ? 'Researching… searching sources and running the numbers. This can take a minute or two.' : 'Enter to ask, Shift+Enter for a new line.' }}</span>
      <div class="row">
        <UiButton v-if="followup" variant="ghost" size="sm" :disabled="busy" @click="restart">Start over</UiButton>
        <UiButton type="submit" variant="primary" icon="research" :loading="busy" :disabled="!question.trim()">{{ followup ? 'Answer' : 'Research' }}</UiButton>
      </div>
    </div>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    <p v-if="message" class="notice info" role="status">{{ message }}</p>
  </UiPanel>

  <UiPanel v-if="!notes.length">
    <UiEmptyState title="No research yet" icon="research">
      Research notes appear here: the question, a verdict, sources checked against the page, and the calculations behind the numbers.
    </UiEmptyState>
  </UiPanel>

  <template v-else>
    <div class="filters">
      <UiTabs v-model="verdict" :items="tabs" />
      <label class="search">
        <span class="sr-only">Search research notes</span>
        <input v-model="search" type="search" placeholder="Search questions and answers">
      </label>
    </div>
    <p v-if="!shown.length" class="muted none">No research notes match.</p>
    <ul v-else class="list">
      <li v-for="n in shown" :key="n.id">
        <NuxtLink :to="`/research/${n.id}`" class="note">
          <span class="row top">
            <UiBadge :tone="VERDICTS[n.verdict].tone">{{ VERDICTS[n.verdict].label }}</UiBadge>
            <UiBadge v-if="n.recorded" tone="pencil" title="Replayed from a recorded run for tests, not researched live">Recorded run</UiBadge>
            <span class="small faint">{{ n.created_by_name }} · {{ ago(n.created_at) }}</span>
          </span>
          <b class="q">{{ n.question }}</b>
          <span class="a small muted">{{ n.answer }}</span>
          <span class="small faint">
            <template v-if="n.sources.total">{{ n.sources.verified }} of {{ n.sources.total }} source{{ n.sources.total === 1 ? '' : 's' }} verified</template>
            <template v-else>No sources</template>
            <template v-if="n.calculations"> · {{ n.calculations }} calculation{{ n.calculations === 1 ? '' : 's' }}</template>
            <template v-if="n.pinned"> · pinned to a passage</template>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </template>
</template>

<style scoped>
.ask { display: grid; gap: var(--s-3); margin-bottom: var(--s-5); max-width: 760px; }
.kicker { margin: 0; display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-xs); font-weight: 600; color: var(--research); text-transform: uppercase; letter-spacing: 0.04em; }
.ask textarea { width: 100%; resize: vertical; }
.followup { display: grid; gap: var(--s-2); padding: var(--s-3); border: 1px dashed var(--line-strong); border-radius: var(--r-md); }
.followup p { margin: 0; }
.fq { display: flex; gap: var(--s-2); align-items: flex-start; font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.filters { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: end; justify-content: space-between; margin-bottom: var(--s-4); border-bottom: 1px solid var(--line); }
.filters :deep(.tabs) { border-bottom: 0; }
.filters .tabs-wrap { margin-bottom: -1px; min-width: 0; max-width: 100%; }
.search { min-width: 240px; padding-bottom: var(--s-2); }
.search input { width: 100%; }
.none { margin: 0; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); max-width: 760px; }
.note { display: grid; gap: 6px; padding: var(--s-4); border: 1px solid var(--line); border-left: 3px solid var(--research); border-radius: var(--r-lg); background: var(--raised); color: inherit; text-decoration: none; }
.note:hover { border-color: var(--line-strong); border-left-color: var(--research); }
.note .top { gap: var(--s-2); flex-wrap: wrap; }
.q { font-size: var(--text-md); }
.a { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 720px) {
  .search { min-width: 0; width: 100%; }
}
</style>
