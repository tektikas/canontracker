<script setup lang="ts">
// Viewers read only; the server refuses their writes too (server/middleware/access.ts).
const editor = computed(() => canEdit(useMe().value))
const route = useRoute()
const { data: pending, refresh } = await useFetch('/api/facts', { query: { status: 'pending' } })
const { data: rejected, refresh: refreshRejected } = await useFetch('/api/facts', { query: { status: 'rejected' } })
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const fill = useFillAction()

// Decisions made on this visit. They leave the queue at once; the refresh that follows confirms it from the server.
const decided = reactive<Record<string, 'accepted' | 'rejected'>>({})
const last = ref<{ decision: 'accepted' | 'rejected' | 'added', statement: string }>()
const tour = useTourSignal()
const queue = computed(() => (pending.value ?? []).filter(f => !decided[f.id]))
// Every candidate ends up pending, canon or rejected; applying a change swaps one canon fact for another, so this sum stays the candidate count.
const total = computed(() => (stats.value ? stats.value.canon - stats.value.authored_canon + stats.value.rejected + stats.value.pending : queue.value.length))
const reviewed = computed(() => Math.max(0, total.value - queue.value.length))
const decidedNow = computed(() => Object.values(decided))

const selectedId = ref(typeof route.query.fact === 'string' ? route.query.fact : undefined)
// The guided tour opens a candidate by link while Review is already open.
watch(() => route.query.fact, (v) => { if (typeof v === 'string') selectedId.value = v })
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
  tour.value = { did: decided[f.id]!, id: f.id }
  mode.value = 'idle'
  panel.value?.focus({ preventScroll: true })
  // Not awaited: a newer refresh cancels an older one, and a cancelled refresh never settles.
  refresh()
  refreshRejected()
  refreshNuxtData('stats')
  if (decision !== 'reject') refreshEntities() // a new canon name gets its page; mentions link it
}

// Accept every verified candidate still waiting, as one informed decision: the sheet lists each one (statement and source)
// before anything happens. Blocked candidates (quote not in the source) are never in the list; the server re-checks each.
const verifiedLeft = computed(() => queue.value.filter(verified))
const bulkOpen = ref(false)
const bulkBusy = ref(false)
const bulkError = ref('')
const bulkShown = ref<typeof verifiedLeft.value>([])
// Candidates the server refused because they changed after the sheet opened; they stay in the queue for a one-by-one look.
const bulkChanged = ref<typeof verifiedLeft.value>([])
const citeEv = (f: Record<string, any>) => f.evidence.find((x: any) => x.verified)
const cite = (f: Record<string, any>) => {
  const e = citeEv(f)
  return e ? `${e.document_title}${e.start_line ? `, line ${e.start_line}` : ''}` : ''
}
// Merge decisions that rename names on accept, as the single review shows them; counted once per name.
const bulkBlocked = computed(() => queue.value.length - verifiedLeft.value.length)
const bulkMapped = computed(() => new Set(bulkShown.value.flatMap(f => f.identity.map(i => `${i.from}\u0000${i.to}`))).size)
function openBulk() {
  bulkShown.value = verifiedLeft.value
  bulkChanged.value = []
  bulkError.value = ''
  bulkOpen.value = !!bulkShown.value.length
}
// The tour opens the sheet with ?bulk=1; the person still reads the list and confirms.
watch(() => route.query.bulk, (v) => {
  if (v !== '1' || !editor.value) return
  openBulk()
  navigateTo({ query: { ...route.query, bulk: undefined } }, { replace: true })
})
onMounted(() => { if (route.query.bulk === '1' && editor.value) openBulk() })
async function acceptAll() {
  if (bulkBusy.value) return
  bulkBusy.value = true
  bulkError.value = ''
  try {
    // Each candidate goes with the fingerprint of what this sheet shows; the server refuses the lot if any of them changed.
    const items = bulkShown.value.map(f => ({ id: f.id, fingerprint: candidateFingerprint(f) }))
    const r = await $fetch('/api/facts/accept-verified', { method: 'POST', body: { items } })
    for (const id of r.accepted) decided[id] = 'accepted'
    last.value = { decision: 'accepted', statement: `${counted(r.accepted.length, 'candidate')}${r.skipped.length ? ` · ${r.skipped.length} skipped (already decided or quote not found)` : ''}` }
    tour.value = { did: 'bulk' }
    bulkOpen.value = false
  } catch (e) {
    const changed: string[] | undefined = (e as { data?: { data?: { changed?: string[] } } }).data?.data?.changed
    if (changed?.length) {
      // Nothing was accepted. Show the fresh list without the changed ones; the person reads it and confirms again.
      await refresh()
      bulkChanged.value = bulkShown.value.filter(f => changed.includes(f.id))
      bulkShown.value = verifiedLeft.value.filter(f => !changed.includes(f.id))
    } else bulkError.value = errorMessage(e)
    return
  } finally {
    bulkBusy.value = false
  }
  if (!current.value || decided[current.value.id]) selectedId.value = queue.value[0]?.id
  refresh()
  refreshNuxtData('stats')
  refreshEntities()
}

// Keyboard triage (desktop). Each key is one explicit decision; held keys don't repeat, and typing in a field never triggers one.
function onKey(e: KeyboardEvent) {
  if (!editor.value || e.ctrlKey || e.metaKey || e.altKey || composing(e) || mode.value !== 'idle' || matchMedia(NO_KEYS).matches) return
  if (bulkOpen.value || (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable], .sidebar, .topbar, dialog'))) return
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

// A fact or note added from the source panel: a fact sent to review joins the queue; one added to canon shows on top.
function sourceSaved(kind: 'fact' | 'note', r: Record<string, any>) {
  if (kind === 'note') return
  last.value = { decision: r.to === 'canon' ? 'accepted' : 'added', statement: r.statement }
  refresh()
  refreshNuxtData('stats')
  if (r.to === 'canon') refreshEntities()
}

// Source passage for the split view.
const source = computed(() => current.value?.evidence[evIndex.value] ?? current.value?.evidence[0])
const docId = computed(() => source.value?.document_id as string | undefined)
// useRequestFetch forwards the session cookie during SSR; a bare $fetch there is signed out and the panel would hydrate empty.
const reqFetch = useRequestFetch()
const { data: doc } = await useAsyncData('review-source', () => (docId.value ? reqFetch(`/api/documents/${docId.value}`) : Promise.resolve(null)), { watch: [docId] })
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
      <UiBadge :tone="last.decision === 'accepted' ? 'accent' : last.decision === 'added' ? 'pencil' : 'bad'">{{ last.decision === 'accepted' ? 'Accepted into canon' : last.decision === 'added' ? 'Added to the queue' : 'Rejected' }}</UiBadge>
      <span class="last-text">{{ last.statement }}</span>
    </template>
  </p>

  <UiPanel v-if="!current">
    <UiEmptyState :title="reviewed ? 'Queue done' : 'Nothing waiting for review'" :icon="reviewed ? 'check' : 'review'">
      <template v-if="decidedNow.length">You decided {{ decidedNow.length }} {{ decidedNow.length === 1 ? 'candidate' : 'candidates' }} on this visit: {{ decidedNow.filter(d => d === 'accepted').length }} accepted, {{ decidedNow.filter(d => d === 'rejected').length }} rejected.</template>
      <template v-else-if="reviewed">All {{ reviewed }} candidates have a decision.</template>
      <template v-else-if="stats?.documents">No candidates were proposed from this project’s sources. Select words in a source to add a fact, or send one here for someone to review.</template>
      <template v-else>Add sources on Home and the model’s candidates show up here. You can also select text in a source and send a fact here for someone to review.</template>
      <template v-if="reviewed || decidedNow.length || stats?.canon" #actions>
        <UiButton variant="primary" to="/canon" icon="canon">Browse canon</UiButton>
        <UiButton to="/conflicts" icon="conflicts">Check conflicts</UiButton>
      </template>
      <template v-else #actions>
        <UiButton variant="primary" :icon="fill.icon" :to="fill.to">{{ fill.label }}</UiButton>
      </template>
    </UiEmptyState>
  </UiPanel>

  <div v-else class="split">
    <section ref="panel" class="panel candidate" data-tour="candidate" :data-fact="current.id" tabindex="-1" :aria-label="`Candidate ${index + 1} of ${queue.length}`">
      <header class="cand-head">
        <span class="cand-pos">Candidate {{ index + 1 }} <span class="faint">of {{ queue.length }}</span></span>
        <div class="row">
          <UiBadge v-if="current.agent_name" tone="accent" :title="`Proposed over MCP with the API token “${current.agent_name}”. Not canon until you accept it.`">
            Agent proposal
          </UiBadge>
          <UiBadge v-if="current.confidence != null" :tone="lowConfidence(current) ? 'warn' : 'neutral'" :title="lowConfidence(current) ? 'Low model confidence: read the source closely' : 'Model confidence'">
            {{ percent(current.confidence) }} confidence
          </UiBadge>
        </div>
      </header>
      <p v-if="current.origin === 'human'" class="small faint model">Added by {{ current.created_by_name ?? 'a teammate' }} from the source, not proposed by a model</p>
      <p v-else-if="current.origin.startsWith('research:')" class="small faint model">Promoted by {{ current.created_by_name ?? 'a teammate' }} from a <NuxtLink :to="`/research/${current.origin.slice(9)}`">research note</NuxtLink> (outside sources, not canon until you accept it)</p>
      <p v-else-if="current.agent_name" class="small faint model">Proposed by agent <strong>{{ current.agent_name }}</strong> for {{ current.proposed_by_name }}</p>
      <p v-else class="small faint model">Proposed by AI</p>

      <FactSummary v-if="mode !== 'edit'" :fact="current" />

      <p v-for="i in current.identity" :key="i.role" class="notice info identity">
        <UiIcon name="merge" :size="16" />
        <span>
          <b>{{ i.from }} → <NuxtLink v-if="i.entity_id" :to="`/entities/${i.entity_id}`">{{ i.to }}</NuxtLink><template v-else>{{ i.to }}</template></b>
          (merged on {{ shortDate(i.merged_at) }}<template v-if="i.merged_by_name"> by {{ i.merged_by_name }}</template>).
          Accepting saves the {{ i.role }} as {{ i.to }}; the statement and quote stay as written.
        </span>
      </p>

      <div class="evidence">
        <SourceRef v-for="ev in current.evidence" :key="ev.id" :ev="ev" />
      </div>

      <p v-if="!verified(current)" class="notice bad" data-tour="blocked" :class="{ refused: error === BLOCKED }">
        <UiIcon name="conflicts" :size="16" />
        <span><b v-if="error === BLOCKED" role="alert">Accept refused. </b>The model's quote doesn't appear in the source, so this can't become canon. Reject it, or leave it pending until the source says it.</span>
      </p>

      <form v-if="mode === 'edit'" class="stack decision" data-tour="decide" @submit.prevent="decide('correct_and_accept')" @keydown="formKey">
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

      <form v-else-if="mode === 'reject'" class="stack decision" data-tour="decide" @submit.prevent="decide('reject')" @keydown="formKey">
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

      <p v-else-if="!editor" class="small muted decision"><UiIcon name="lock" :size="14" /> View only. An editor, admin or owner decides on candidates.</p>
      <div v-else class="row decision" data-tour="decide">
        <UiButton variant="primary" icon="check" :loading="busy" :disabled="!verified(current)" @click="decide('accept')">Accept <kbd>A</kbd></UiButton>
        <UiButton :disabled="busy || !verified(current)" @click="open('edit')">Edit &amp; accept <kbd>E</kbd></UiButton>
        <UiButton variant="danger" :disabled="busy" @click="open('reject')">Reject… <kbd>R</kbd></UiButton>
      </div>

      <p v-if="error && error !== BLOCKED" class="notice bad" role="alert">{{ error }}</p>

      <p v-if="editor" class="keys small faint">
        <kbd>J</kbd> <kbd>K</kbd> next / previous · <kbd>A</kbd> accept · <kbd>E</kbd> edit · <kbd>R</kbd> reject · <kbd>Esc</kbd> cancel
      </p>
    </section>

    <UiPanel class="reader-panel" flush>
      <header class="source-head">
        <div class="source-title">
          <UiIcon name="file" :size="16" />
          <b :title="source?.document_title">{{ source?.document_title }}</b>
          <span class="faint small">{{ source?.verified ? `line ${source.start_line}${source.end_line !== source.start_line ? `–${source.end_line}` : ''}` : 'no matching line' }}</span>
        </div>
        <div class="row">
          <template v-if="current.evidence.length > 1">
            <UiButton v-for="(ev, i) in current.evidence" :key="ev.id" size="sm" :variant="i === evIndex ? 'primary' : 'ghost'" @click="evIndex = i">Source {{ i + 1 }}</UiButton>
          </template>
          <UiButton v-if="source" size="sm" variant="ghost" :to="`/documents/${source.document_id}${source.passage_id ? `#${source.passage_id}` : ''}`">Open document</UiButton>
        </div>
      </header>
      <PassageReader v-if="docReady" class="source-body" :doc="docReady" :active="source?.passage_id" :quote="source?.verified ? source.quote : undefined" contained :annotate="editor && docReady.latest.id === docReady.id" @saved="sourceSaved" />
      <p v-else class="source-body faint small loading">Loading source…</p>
    </UiPanel>

    <UiPanel class="queue" flush title="Queue" :description="`${queue.length} waiting`">
      <template v-if="editor && verifiedLeft.length" #actions>
        <UiButton size="sm" icon="check" data-tour="bulk" @click="openBulk">Accept all {{ verifiedLeft.length }} verified…</UiButton>
      </template>
      <ol ref="list" class="queue-list">
        <TransitionGroup name="q">
          <li v-for="(f, i) in queue" :key="f.id">
            <button type="button" class="queue-item" :aria-current="f.id === current.id ? 'true' : undefined" @click="selectedId = f.id">
              <span class="q-n faint">{{ i + 1 }}</span>
              <span class="q-text">{{ f.statement }}</span>
              <UiBadge v-if="!verified(f)" tone="bad" dot title="Quote not found in source">Blocked</UiBadge>
              <span v-else-if="f.origin === 'human'" class="q-conf" title="Added by a person">by hand</span>
              <span v-else-if="f.agent_name" class="q-conf" :title="`Proposed by agent ${f.agent_name}`">agent</span>
              <span v-else class="q-conf" :class="{ low: lowConfidence(f) }">{{ percent(f.confidence) }}</span>
            </button>
          </li>
        </TransitionGroup>
      </ol>
    </UiPanel>
  </div>

  <UiDialog v-model:open="bulkOpen" wide :title="`Accept ${counted(bulkShown.length, 'verified candidate')}?`" @submit="acceptAll">
    <p>Each one becomes canon with your name on it in the audit log. Every quote below appears word for word in its source.
      <template v-if="bulkBlocked"> {{ counted(bulkBlocked, 'blocked candidate') }} (quote not found) {{ bulkBlocked === 1 ? 'stays' : 'stay' }} in the queue.</template>
      Read the list first; anything you’re unsure of, close this and decide it on its own.</p>
    <div v-if="bulkChanged.length" class="notice warn" role="alert">
      <UiIcon name="conflicts" :size="16" />
      <span><b>Nothing was accepted.</b> {{ counted(bulkChanged.length, 'candidate') }} changed since you opened the list (its source, version or name mapping), so {{ bulkChanged.length === 1 ? 'it was' : 'they were' }} taken out — review {{ bulkChanged.length === 1 ? 'it' : 'them' }} on {{ bulkChanged.length === 1 ? 'its' : 'their' }} own:
        <template v-for="(f, i) in bulkChanged" :key="f.id">{{ i ? '; ' : ' ' }}“{{ f.statement }}”</template>
        <template v-if="bulkShown.length"> Check the list below and confirm again.</template></span>
    </div>
    <p v-if="bulkMapped" class="notice info">
      <UiIcon name="merge" :size="16" />
      <span>{{ bulkMapped === 1 ? '1 name will be linked to an existing page' : `${bulkMapped} names will be linked to existing pages` }} (merged earlier); marked below. The statement and quote stay as written.</span>
    </p>
    <ol class="bulk-list">
      <li v-for="f in bulkShown" :key="f.id">
        <span class="statement">{{ f.statement }}</span>
        <span class="small muted">
          <UiBadge tone="good" dot>Quote verified</UiBadge>
          {{ cite(f) }}
          <UiBadge v-if="citeEv(f) && citeEv(f).latest_version > citeEv(f).document_version" tone="warn">Stale: source now v{{ citeEv(f).latest_version }}</UiBadge>
        </span>
        <span v-for="i in f.identity" :key="i.role" class="small mapping">
          <UiIcon name="merge" :size="14" /> Saved with {{ i.role }} <b>{{ i.from }} → {{ i.to }}</b>
        </span>
      </li>
    </ol>
    <p v-if="bulkError" class="notice bad" role="alert">{{ bulkError }}</p>
    <template #actions>
      <UiButton variant="ghost" @click="bulkOpen = false">Cancel</UiButton>
      <UiButton variant="primary" type="submit" icon="check" :loading="bulkBusy" :disabled="!bulkShown.length">Accept {{ bulkShown.length }} into canon<UiSendKey /></UiButton>
    </template>
  </UiDialog>

  <details v-if="rejected?.length" class="panel rejected">
    <summary><b>Rejected</b> <span class="faint">{{ rejected.length }} · kept for the audit trail, never part of canon</span></summary>
    <ul class="rejected-list">
      <li v-for="f in rejected" :key="f.id">
        <div class="statement">{{ f.statement }}</div>
        <div class="small muted"><template v-if="f.decided_by_name">Rejected by {{ f.decided_by_name }} · </template>Reason: {{ f.rationale }}</div>
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

.source-head { display: flex; justify-content: space-between; align-items: center; gap: var(--s-2); flex-wrap: wrap; padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--line); background: var(--surface); }
.source-title { display: flex; align-items: center; gap: var(--s-2); min-width: 0; font-size: var(--text-sm); }
.source-title b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-title .faint { white-space: nowrap; }
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
/* A decided row folds away in place instead of the rows below jumping up (DESIGN: motion answers a user action). */
.queue-list li { overflow: hidden; }
.q-leave-active { transition: opacity var(--dur-1) var(--ease), max-height var(--dur-2) var(--ease); max-height: 44px; }
.q-leave-to { opacity: 0; max-height: 0; }
@media (prefers-reduced-motion: reduce) { .q-leave-active { transition: none; } }

.bulk-list { list-style: none; margin: 0; padding: 0; display: grid; border: 1px solid var(--line); border-radius: var(--r-md); max-height: min(50vh, 420px); overflow-y: auto; color: var(--ink); }
.bulk-list li { display: grid; gap: 4px; padding: var(--s-2) var(--s-3); }
.bulk-list li + li { border-top: 1px solid var(--line); }
.bulk-list .statement { font-size: var(--text-base); }
.bulk-list .small { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.bulk-list .mapping { color: var(--ink); }

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
  .source-head { flex-wrap: nowrap; }
  .source-title { flex: 1; }
  .source-head .row { flex: none; }
  .triple-fields { grid-template-columns: 1fr; }
  .queue-item { padding: 8px var(--s-4); min-height: 42px; }
  .progress { min-width: 0; width: 100%; }
}
/* Shortcuts are a desktop affordance; touch users get the same buttons without the key hints. */
@media (hover: none), (max-width: 900px) {
  .keys { display: none; }
}
</style>
