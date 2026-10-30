<script setup lang="ts">
const route = useRoute()
const { data: pending, refresh } = await useFetch('/api/facts', { query: { status: 'pending' } })
const { data: rejected, refresh: refreshRejected } = await useFetch('/api/facts', { query: { status: 'rejected' } })
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const recorded = computed(() => stats.value?.model.mode === 'mock')

// Decisions made on this visit. They leave the queue at once; the refresh that follows confirms it from the server.
const decided = reactive<Record<string, 'accepted' | 'rejected'>>({})
const last = ref<{ decision: 'accepted' | 'rejected', statement: string }>()
const queue = computed(() => (pending.value ?? []).filter(f => !decided[f.id]))
// Every candidate ends up pending, canon or rejected; applying a change swaps one canon fact for another, so this sum stays the candidate count.
const total = computed(() => (stats.value ? stats.value.canon + stats.value.rejected + stats.value.pending : queue.value.length))
const reviewed = computed(() => Math.max(0, total.value - queue.value.length))
const decidedNow = computed(() => Object.values(decided))

const selectedId = ref(typeof route.query.fact === 'string' ? route.query.fact : undefined)
const current = computed(() => queue.value.find(f => f.id === selectedId.value) ?? queue.value[0])
const index = computed(() => (current.value ? queue.value.indexOf(current.value) : -1))
const verified = (f: Record<string, any>) => f.evidence.some((e: any) => e.verified)
const lowConfidence = (f: Record<string, any>) => f.confidence != null && f.confidence < 0.7

type Mode = 'idle' | 'edit' | 'reject'
const mode = ref<Mode>('idle')
const form = reactive({ statement: '', subject: '', predicate: '', object: '', rationale: '' })
const error = ref('')
const busy = ref(false)
const evIndex = ref(0)
const BLOCKED = 'Accept is blocked: this quote is not in the source word for word. Reject it, or leave it pending.'
// An Enter that confirms an IME composition (Japanese, Chinese, Korean…) is not a decision.
const composing = (e: KeyboardEvent) => e.isComposing || e.keyCode === 229
// Same breakpoint as the CSS that hides the key hints: touch or narrow screens get buttons only.
const NO_KEYS = '(hover: none), (max-width: 900px)'

// Every move to another candidate starts clean: no half-typed reason carries over.
watch(() => current.value?.id, () => {
  mode.value = 'idle'
  error.value = ''
  evIndex.value = 0
})

const panel = ref<HTMLElement>()
const firstField = ref<HTMLInputElement | HTMLTextAreaElement>()
async function open(m: Mode) {
  const f = current.value
  if (!f || busy.value) return
  if (m === 'edit' && !verified(f)) {
    error.value = BLOCKED
    return
  }
  error.value = ''
  Object.assign(form, { statement: f.statement, subject: f.subject, predicate: f.predicate, object: f.object ?? '', rationale: '' })
  mode.value = m
  await nextTick()
  firstField.value?.focus()
}
function cancel() {
  mode.value = 'idle'
  error.value = ''
  panel.value?.focus({ preventScroll: true })
}
// Esc cancels; Enter in the statement box saves instead of adding a line break. Keys that belong to an IME composition do neither.
function formKey(e: KeyboardEvent) {
  if (composing(e)) return
  if (e.key === 'Escape') cancel()
  else if (e.key === 'Enter' && e.target instanceof HTMLTextAreaElement && !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)) e.target.form?.requestSubmit()
  else return
  e.preventDefault()
}

function move(step: number) {
  const next = queue.value[index.value + step]
  if (next) selectedId.value = next.id
}

async function decide(decision: 'accept' | 'correct_and_accept' | 'reject') {
  const f = current.value
  if (!f || busy.value) return
  if (decision !== 'reject' && !verified(f)) {
    error.value = BLOCKED
    return
  }
  if (decision === 'reject' && !form.rationale.trim()) {
    error.value = 'Say why it is rejected.'
    return
  }
  const i = queue.value.indexOf(f)
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/facts/${f.id}/review`, {
      method: 'POST',
      body: {
        decision,
        rationale: mode.value === 'idle' ? undefined : form.rationale,
        corrected: decision === 'correct_and_accept' ? { statement: form.statement, subject: form.subject, predicate: form.predicate, object: form.object } : undefined,
      },
    })
  } catch (e) {
    error.value = errorMessage(e)
    return
  } finally {
    busy.value = false
  }
  // If the user moved to another candidate while the request ran, keep their choice; otherwise advance from the decided one.
  const stayed = current.value?.id === f.id
  const next = queue.value[i + 1] ?? queue.value[i - 1]
  decided[f.id] = decision === 'reject' ? 'rejected' : 'accepted'
  last.value = { decision: decided[f.id]!, statement: decision === 'correct_and_accept' ? form.statement : f.statement }
  if (stayed) selectedId.value = next?.id
  mode.value = 'idle'
  panel.value?.focus({ preventScroll: true })
  // Not awaited: a newer refresh cancels an older one, and a cancelled refresh never settles.
  refresh()
  refreshRejected()
  refreshNuxtData('stats')
}

// Keyboard triage (desktop). Each key is one explicit decision; held keys don't repeat, and typing in a field never triggers one.
function onKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || composing(e) || mode.value !== 'idle' || matchMedia(NO_KEYS).matches) return
  if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable], .sidebar, .topbar')) return
  const key = e.key.toLowerCase()
  if (key === 'j') move(1)
  else if (key === 'k') move(-1)
  else if (e.repeat) return
  else if (key === 'a') decide('accept')
  else if (key === 'e') open('edit')
  else if (key === 'r') open('reject')
  else return
  e.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// Keep the selected row visible inside the queue list without scrolling the page.
const list = ref<HTMLElement>()
watch(() => current.value?.id, async () => {
  await nextTick()
  const box = list.value
  const el = box?.querySelector<HTMLElement>('[aria-current="true"]')
  if (!box || !el) return
  if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop
  else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight
}, { flush: 'post' })

// Source passage for the split view.
const source = computed(() => current.value?.evidence[evIndex.value] ?? current.value?.evidence[0])
const docId = computed(() => source.value?.document_id as string | undefined)
const { data: doc } = await useAsyncData('review-source', () => (docId.value ? $fetch(`/api/documents/${docId.value}`) : Promise.resolve(null)), { watch: [docId] })
const docReady = computed(() => doc.value && doc.value.id === docId.value ? doc.value : null)
</script>

<template>
  <UiPageHeader title="Review queue">
    The model proposes; you decide. Nothing becomes canon until you accept it, and a quote that isn't in the source word for word can't be accepted.
    <template v-if="total" #actions>
      <div class="progress" role="status">
        <div class="progress-label">
          <b>{{ reviewed }} of {{ total }} reviewed</b>
          <span class="faint">{{ queue.length }} left</span>
        </div>
        <div class="progress-bar" aria-hidden="true"><span :style="{ width: `${(reviewed / total) * 100}%` }" /></div>
      </div>
    </template>
  </UiPageHeader>

  <p class="last" aria-live="polite">
    <template v-if="last">
      <UiBadge :tone="last.decision === 'accepted' ? 'accent' : 'bad'">{{ last.decision === 'accepted' ? 'Accepted into canon' : 'Rejected' }}</UiBadge>
      <span class="last-text">{{ last.statement }}</span>
    </template>
  </p>

  <UiPanel v-if="!current">
    <UiEmptyState :title="reviewed ? 'Queue done' : 'Nothing waiting for review'" icon="check">
      <template v-if="decidedNow.length">You decided {{ decidedNow.length }} {{ decidedNow.length === 1 ? 'candidate' : 'candidates' }} on this visit: {{ decidedNow.filter(d => d === 'accepted').length }} accepted, {{ decidedNow.filter(d => d === 'rejected').length }} rejected.</template>
      <template v-else-if="reviewed">All {{ reviewed }} candidates have a decision.</template>
      <template v-else>Import sources on Home and the model's candidates show up here.</template>
      <template #actions>
        <UiButton variant="primary" to="/canon" icon="canon">Browse canon</UiButton>
        <UiButton to="/conflicts" icon="conflicts">Check conflicts</UiButton>
      </template>
    </UiEmptyState>
  </UiPanel>

  <div v-else class="split">
    <section ref="panel" class="panel candidate" tabindex="-1" :aria-label="`Candidate ${index + 1} of ${queue.length}`">
      <header class="cand-head">
        <span class="cand-pos">Candidate {{ index + 1 }} <span class="faint">of {{ queue.length }}</span></span>
        <div class="row">
          <UiBadge :tone="lowConfidence(current) ? 'warn' : 'neutral'" :title="lowConfidence(current) ? 'Low model confidence: read the source closely' : 'Model confidence'">
            {{ percent(current.confidence) }} confidence
          </UiBadge>
          <UiBadge v-if="recorded" tone="warn" title="Replayed from a recorded extraction, not a live model call">Recorded run</UiBadge>
        </div>
      </header>
      <p class="small faint model">Proposed by <span class="mono">{{ current.model_id }}</span></p>

      <FactSummary v-if="mode !== 'edit'" :fact="current" />

      <div class="evidence">
        <SourceRef v-for="ev in current.evidence" :key="ev.id" :ev="ev" />
      </div>

      <p v-if="!verified(current)" class="notice bad" :class="{ refused: error === BLOCKED }">
        <UiIcon name="conflicts" :size="16" />
        <span><b v-if="error === BLOCKED" role="alert">Accept refused. </b>The model's quote doesn't appear in the source, so this can't become canon. Reject it, or leave it pending until the source says it.</span>
      </p>

      <form v-if="mode === 'edit'" class="stack decision" @submit.prevent="decide('correct_and_accept')" @keydown="formKey">
        <UiField label="Statement">
          <textarea ref="firstField" v-model="form.statement" rows="2" required />
        </UiField>
        <div class="triple-fields">
          <UiField label="Subject"><input v-model="form.subject" type="text" required></UiField>
          <UiField label="Predicate"><input v-model="form.predicate" type="text" required></UiField>
          <UiField label="Object"><input v-model="form.object" type="text"></UiField>
        </div>
        <UiField label="Note" hint="Optional. Saved to the audit log.">
          <input v-model="form.rationale" type="text" placeholder="e.g. Fixed the time to match the scene">
        </UiField>
        <div class="row">
          <UiButton type="submit" variant="primary" icon="check" :loading="busy">Save &amp; accept <kbd>↵</kbd></UiButton>
          <UiButton @click="cancel">Cancel <kbd>Esc</kbd></UiButton>
        </div>
      </form>

      <form v-else-if="mode === 'reject'" class="stack decision" @submit.prevent="decide('reject')" @keydown="formKey">
        <UiField label="Why reject it?" hint="Required. Saved to the audit log; the candidate is kept but never becomes canon.">
          <input ref="firstField" v-model="form.rationale" type="text" list="reject-reasons" required placeholder="e.g. Figurative, not a literal relationship">
        </UiField>
        <datalist id="reject-reasons">
          <option value="Figurative, not a literal relationship" />
          <option value="Not supported by the quote" />
          <option value="Quote not found in the source" />
          <option value="Duplicate of an existing fact" />
        </datalist>
        <div class="row">
          <UiButton type="submit" variant="danger" :loading="busy" :disabled="!form.rationale.trim()">Confirm reject <kbd>↵</kbd></UiButton>
          <UiButton @click="cancel">Cancel <kbd>Esc</kbd></UiButton>
        </div>
      </form>

      <div v-else class="row decision">
        <UiButton variant="primary" icon="check" :loading="busy" :disabled="!verified(current)" @click="decide('accept')">Accept <kbd>A</kbd></UiButton>
        <UiButton :disabled="busy || !verified(current)" @click="open('edit')">Edit &amp; accept <kbd>E</kbd></UiButton>
        <UiButton variant="danger" :disabled="busy" @click="open('reject')">Reject… <kbd>R</kbd></UiButton>
      </div>

      <p v-if="error && error !== BLOCKED" class="notice bad" role="alert">{{ error }}</p>

      <p class="keys small faint">
        <kbd>J</kbd> <kbd>K</kbd> next / previous · <kbd>A</kbd> accept · <kbd>E</kbd> edit · <kbd>R</kbd> reject · <kbd>Esc</kbd> cancel
      </p>
    </section>

    <UiPanel class="reader-panel" flush>
      <header class="source-head">
        <div class="source-title">
          <UiIcon name="file" :size="16" />
          <b>{{ source?.document_title }}</b>
          <span class="faint small">{{ source?.verified ? `line ${source.start_line}${source.end_line !== source.start_line ? `–${source.end_line}` : ''}` : 'no matching line' }}</span>
        </div>
        <div class="row">
          <template v-if="current.evidence.length > 1">
            <UiButton v-for="(ev, i) in current.evidence" :key="ev.id" size="sm" :variant="i === evIndex ? 'primary' : 'ghost'" @click="evIndex = i">Source {{ i + 1 }}</UiButton>
          </template>
          <UiButton v-if="source" size="sm" variant="ghost" :to="`/documents/${source.document_id}${source.passage_id ? `#${source.passage_id}` : ''}`">Open document</UiButton>
        </div>
      </header>
      <PassageReader v-if="docReady" class="source-body" :doc="docReady" :active="source?.passage_id" :quote="source?.verified ? source.quote : undefined" contained />
      <p v-else class="source-body faint small loading">Loading source…</p>
    </UiPanel>

    <UiPanel class="queue" flush title="Queue" :description="`${queue.length} waiting`">
      <ol ref="list" class="queue-list">
        <li v-for="(f, i) in queue" :key="f.id">
          <button type="button" class="queue-item" :aria-current="f.id === current.id ? 'true' : undefined" @click="selectedId = f.id">
            <span class="q-n faint">{{ i + 1 }}</span>
            <span class="q-text">{{ f.statement }}</span>
            <UiBadge v-if="!verified(f)" tone="bad" dot title="Quote not found in source">Blocked</UiBadge>
            <span v-else class="q-conf" :class="{ low: lowConfidence(f) }">{{ percent(f.confidence) }}</span>
          </button>
        </li>
      </ol>
    </UiPanel>
  </div>

  <details v-if="rejected?.length" class="panel rejected">
    <summary><b>Rejected</b> <span class="faint">{{ rejected.length }} · kept for the audit trail, never part of canon</span></summary>
    <ul class="rejected-list">
      <li v-for="f in rejected" :key="f.id">
        <div class="statement">{{ f.statement }}</div>
        <div class="small muted">Reason: {{ f.rationale }}</div>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.progress { display: grid; gap: 6px; min-width: 200px; }
.progress-label { display: flex; justify-content: space-between; gap: var(--s-3); font-size: var(--text-sm); }
.progress-bar { height: 6px; border-radius: 3px; background: var(--sunken); overflow: hidden; }
.progress-bar span { display: block; height: 100%; background: var(--accent); transition: width var(--dur-2) var(--ease); }

.last { display: flex; align-items: center; gap: var(--s-2); min-height: 22px; margin: 0 0 var(--s-3); font-size: var(--text-sm); color: var(--muted); }
.last:empty { min-height: 0; margin: 0; }
.last-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

.split {
  display: grid; gap: var(--s-4); align-items: start;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas: "candidate source" "queue source";
}
.candidate { grid-area: candidate; display: grid; gap: var(--s-3); outline: none; }
.candidate:focus-visible { box-shadow: 0 0 0 2px var(--accent); }
.reader-panel { grid-area: source; position: sticky; top: var(--s-5); display: flex; flex-direction: column; max-height: calc(100vh - 2 * var(--s-5)); }
.queue { grid-area: queue; }

.cand-head { display: flex; justify-content: space-between; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
.cand-pos { font-weight: 600; font-size: var(--text-sm); }
.model { margin: -6px 0 0; }
.evidence { display: grid; gap: var(--s-3); }
.notice.refused { border-color: var(--bad); box-shadow: inset 3px 0 0 var(--bad); }
.decision { padding-top: var(--s-3); border-top: 1px solid var(--line); }
.triple-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-3); }
.keys { margin: 0; }
kbd {
  font: 600 11px/1 var(--font-code); padding: 2px 5px; border-radius: var(--r-sm);
  border: 1px solid var(--line-strong); border-bottom-width: 2px; color: inherit;
}
.btn kbd { margin-left: 4px; }

.source-head { display: flex; justify-content: space-between; align-items: center; gap: var(--s-2); flex-wrap: wrap; padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--line); background: var(--surface); }
.source-title { display: flex; align-items: center; gap: var(--s-2); min-width: 0; font-size: var(--text-sm); }
.source-title b { overflow-wrap: anywhere; }
.source-body { flex: 1; min-height: 0; padding: var(--s-3); }
.loading { margin: 0; }

.queue-list { list-style: none; margin: 0; padding: 0 0 var(--s-2); max-height: 360px; overflow-y: auto; position: relative; }
.queue-item {
  display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: var(--s-2); align-items: center;
  width: 100%; min-height: 36px; padding: 6px var(--s-5); border: 0; background: none; text-align: left;
  font: inherit; font-size: var(--text-sm); color: var(--muted); cursor: pointer;
}
.queue-item:hover { background: var(--sunken); color: var(--ink); }
.queue-item[aria-current="true"] { background: var(--accent-soft); color: var(--ink); box-shadow: inset 3px 0 0 var(--accent); }
.q-n { font-family: var(--font-code); font-size: var(--text-xs); text-align: right; }
.q-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.q-conf { font-size: var(--text-xs); color: var(--faint); font-variant-numeric: tabular-nums; }
.q-conf.low { color: var(--warn); font-weight: 600; }

.rejected { margin-top: var(--s-5); }
.rejected summary { cursor: pointer; display: flex; gap: var(--s-2); align-items: baseline; flex-wrap: wrap; }
.rejected-list { list-style: none; margin: var(--s-3) 0 0; padding: 0; display: grid; gap: var(--s-3); }
.rejected-list .statement { text-decoration: line-through; text-decoration-color: var(--faint); color: var(--muted); }

@media (max-width: 1100px) {
  .split { grid-template-columns: minmax(0, 1fr); grid-template-areas: "candidate" "source" "queue"; }
  .reader-panel { position: static; max-height: none; }
  .source-body { max-height: 45vh; }
}
@media (max-width: 720px) {
  .triple-fields { grid-template-columns: 1fr; }
  .queue-item { padding: 8px var(--s-4); min-height: 42px; }
  .progress { min-width: 0; width: 100%; }
}
/* Shortcuts are a desktop affordance; touch users get the same buttons without the key hints. */
@media (hover: none), (max-width: 900px) {
  kbd, .keys { display: none; }
}
</style>
