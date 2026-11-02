<script setup lang="ts">
// One research note: verdict, answer, each claim with what backs it (a source checked on the page, a calculation, or only
// model knowledge), the calculations with their assumptions, and the agent's trace. Promote makes a pending candidate.
const route = useRoute()
const me = useMe()
const id = computed(() => String(route.params.id))
const { data: note, error: loadError, refresh } = await useFetch(() => `/api/research/${id.value}`)
if (loadError.value) throw createError({ statusCode: loadError.value.statusCode === 404 ? 404 : 500, statusMessage: loadError.value.statusCode === 404 ? 'Research note not found' : 'Could not load the research note', fatal: true })
const n = computed(() => note.value!)
useHead(() => ({ title: `${n.value.question.slice(0, 60)} · Research · Story Bible` }))
const canEdit = computed(() => me.value?.current?.role !== 'viewer')

const STATUS = {
  verified: { label: 'Quote found on the page', short: 'Verified', tone: 'good' },
  unverified: { label: 'Not verified', short: 'Not verified', tone: 'bad' },
  not_checked: { label: 'Source not text-checked', short: 'Not text-checked', tone: 'warn' },
} as const
const source = (k: number) => n.value.sources.find(s => s.n === k)
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
const pretty = (v: unknown) => (typeof v === 'object' && v ? Object.entries(v as Record<string, unknown>) : [['value', v]]) as [string, unknown][]
const show = (v: unknown): string => (v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k.replaceAll('_', ' ')} ${show(x)}`).join(', ') : String(v))
const label = (k: string) => k.replaceAll('_', ' ')
const steps = computed(() => n.value.trace)
const totals = computed(() => ({ ms: steps.value.reduce((a, s) => a + s.latency_ms, 0), tokens: steps.value.reduce((a, s) => a + (s.tokens ?? 0), 0) }))

// Promote: a world rule or a fact candidate, backed by words from this note.
const sentences = computed(() => [...new Set([
  ...n.value.answer.split(/(?<=[.!?])\s+/), ...n.value.claims.map(c => c.text), ...n.value.sources.map(s => s.quote),
].map(s => s.trim()).filter(s => s.length >= 8))])
const promoteOpen = ref(false)
const form = reactive({ as: 'fact' as 'fact' | 'rule', kind: 'claim', subject: '', predicate: '', object: '', statement: '', quote: '', time_from: '', time_to: '', precision: 'approximate' })
const promoteError = ref('')
const promoted = ref<{ id: string } | null>(null)
const busy = ref('')
function openPromote() {
  Object.assign(form, { as: 'fact', kind: 'claim', subject: '', predicate: '', object: '', statement: n.value.claims[0]?.text ?? '', quote: sentences.value[0] ?? '', time_from: '', time_to: '', precision: 'approximate' })
  promoteError.value = ''
  promoted.value = null
  promoteOpen.value = true
}
async function promote() {
  busy.value = 'promote'
  promoteError.value = ''
  try {
    promoted.value = await $fetch(`/api/research/${id.value}/promote`, { method: 'POST', body: { ...form } })
    await refresh()
    refreshNuxtData('stats')
  } catch (e) {
    promoteError.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}

// Pin to a story passage, like a note: pick the document, paste words from the passage.
const pinOpen = ref(false)
const pin = reactive({ document_id: '', quote: '' })
const pinError = ref('')
const { data: docs, execute: loadDocs } = useFetch('/api/documents', { immediate: false, default: () => [] })
async function openPin() {
  pinError.value = ''
  pin.document_id = n.value.pin_document_id ?? ''
  pin.quote = n.value.pin_quote ?? ''
  pinOpen.value = true
  await loadDocs()
}
async function savePin(value: { document_id: string, quote: string } | null) {
  busy.value = 'pin'
  pinError.value = ''
  try {
    await $fetch(`/api/research/${id.value}`, { method: 'PATCH', body: { pin: value } })
    await refresh()
    pinOpen.value = false
  } catch (e) {
    pinError.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <div class="stack page">
    <NuxtLink to="/research" class="back"><UiIcon name="arrow" :size="14" style="transform: scaleX(-1)" /> All research</NuxtLink>

    <header class="head">
      <p class="kicker"><UiIcon name="research" :size="14" /> Research · outside sources, not canon</p>
      <h1>{{ n.question }}</h1>
      <div class="row meta">
        <UiBadge :tone="VERDICTS[n.verdict].tone">{{ VERDICTS[n.verdict].label }}</UiBadge>
        <UiBadge v-if="n.recorded" tone="pencil" title="Replayed from a recorded run for tests, not researched live">Recorded run</UiBadge>
        <span class="small faint">Asked by {{ n.created_by_name }} · {{ shortDate(n.created_at) }}</span>
      </div>
    </header>

    <UiPanel class="answer">
      <p class="lead">{{ n.answer }}</p>
      <p v-if="n.why" class="small muted"><b>Why {{ VERDICTS[n.verdict].label.toLowerCase() }}:</b> {{ n.why }}</p>
      <div v-if="canEdit" class="row actions">
        <UiButton variant="primary" icon="review" @click="openPromote">Promote to a candidate</UiButton>
        <UiButton icon="note" @click="openPin">{{ n.pin_passage_id ? 'Move pin' : 'Pin to a passage' }}</UiButton>
      </div>
      <p v-if="n.pin_passage_id" class="small pinned">
        <UiIcon name="note" :size="14" /> Pinned to
        <NuxtLink :to="`/documents/${n.pin_document_id}#${n.pin_passage_id}`">{{ n.pin_document_title }}, line {{ n.pin_line }}</NuxtLink>
        <template v-if="n.pin_quote"> · “{{ n.pin_quote }}”</template>
        <template v-if="n.pinned_by_name"> · by {{ n.pinned_by_name }}</template>
        <button v-if="canEdit" type="button" class="linkish" :disabled="busy === 'pin'" @click="savePin(null)">Unpin</button>
      </p>
      <div v-if="n.candidates.length" class="cands">
        <p class="small faint">Candidates from this note</p>
        <ul>
          <li v-for="c in n.candidates" :key="c.id" class="small">
            <UiBadge :tone="c.status === 'canon' ? 'accent' : c.status === 'pending' ? 'pencil' : 'neutral'">{{ c.status === 'pending' ? 'In review' : c.status }}</UiBadge>
            <NuxtLink :to="c.status === 'pending' ? '/review' : '/canon'">{{ c.statement }}</NuxtLink>
          </li>
        </ul>
      </div>
    </UiPanel>

    <UiPanel v-if="n.claims.length" title="Claims" description="What backs each claim: a quote checked on the source page, a calculation, or only the AI's own knowledge.">
      <ol class="claims">
        <li v-for="(c, i) in n.claims" :key="i">
          <span>{{ c.text }}</span>
          <span class="backing">
            <template v-if="c.basis === 'source'">
              <a v-for="k in c.sources" :key="k" :href="`#src-${k}`" class="ref" :class="source(k)?.status" :title="source(k) ? STATUS[source(k)!.status].label : ''">[{{ k }}] {{ source(k) ? STATUS[source(k)!.status].short : '' }}</a>
            </template>
            <UiBadge v-else-if="c.basis === 'calculator'" tone="accent">Calculated · {{ label(c.tool ?? '') }}</UiBadge>
            <UiBadge v-else tone="warn" title="No source was cited for this claim">Model knowledge, unverified</UiBadge>
          </span>
        </li>
      </ol>
    </UiPanel>

    <UiPanel v-if="n.sources.length" title="Sources" description="Each web page was fetched and its quote looked up word for word. PDFs are listed but not text-checked.">
      <ol class="sources">
        <li v-for="s in n.sources" :id="`src-${s.n}`" :key="s.n">
          <div class="spread">
            <a :href="s.url" target="_blank" rel="noopener noreferrer nofollow" class="src-title">[{{ s.n }}] {{ s.title || host(s.url) }} <span class="faint small">{{ host(s.url) }}</span></a>
            <UiBadge :tone="STATUS[s.status].tone">{{ STATUS[s.status].label }}</UiBadge>
          </div>
          <blockquote v-if="s.quote" class="src-quote" :class="s.status">{{ s.quote }}</blockquote>
          <p v-if="s.reason" class="small muted">{{ s.reason }}</p>
        </li>
      </ol>
    </UiPanel>

    <UiPanel v-if="n.calculations.length" title="Calculations" description="Numbers come from deterministic calculators, not from the AI.">
      <div class="calcs">
        <details v-for="(c, i) in n.calculations" :key="i" class="calc" :open="i < 2">
          <summary><b>{{ label(c.name) }}</b> <UiBadge v-if="c.error" tone="bad">Error</UiBadge></summary>
          <p class="small muted mono">{{ show(c.args) }}</p>
          <p v-if="c.error" class="small field-error">{{ c.error }}</p>
          <dl v-else class="result">
            <div v-for="[k, v] in pretty(c.result)" :key="k"><dt>{{ label(k) }}</dt><dd>{{ show(v) }}</dd></div>
          </dl>
          <ul v-if="c.assumptions.length" class="small muted assumptions">
            <li v-for="a in c.assumptions" :key="a">{{ a }}</li>
          </ul>
        </details>
      </div>
    </UiPanel>

    <UiPanel title="How this was researched" :description="`${steps.length} step${steps.length === 1 ? '' : 's'} · ${(totals.ms / 1000).toFixed(1)} s${totals.tokens ? ` · ${totals.tokens.toLocaleString('en')} tokens` : ''}${n.searches.length ? ` · ${n.searches.length} web search${n.searches.length === 1 ? '' : 'es'}` : ''}`">
      <div class="table-wrap">
        <table class="trace">
          <thead><tr><th scope="col">Step</th><th scope="col">What</th><th scope="col">Result</th><th scope="col">Time</th></tr></thead>
          <tbody>
            <tr v-for="s in steps" :key="s.id" :class="{ failed: s.status === 'failed' }">
              <td class="mono">{{ (s.step ?? 0) + 1 }}</td>
              <td>{{ s.tool === null ? 'AI' : s.tool === 'web_search' ? 'AI + web search' : label(s.tool) }}</td>
              <td class="small">{{ s.error ?? s.output_summary }}</td>
              <td class="small mono">{{ (s.latency_ms / 1000).toFixed(1) }} s</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiPanel>

    <UiDialog v-model:open="promoteOpen" title="Promote to a candidate" wide @submit="promote">
      <template v-if="promoted">
        <p class="notice info">Sent to Review as a pending candidate. It becomes canon only when someone accepts it there.</p>
      </template>
      <template v-else>
        <p>It goes to Review like any candidate; nothing becomes canon until someone accepts it. Its source is this note, saved read-only in the Library’s Research folder.</p>
        <fieldset class="as">
          <legend class="sr-only">Promote as</legend>
          <label><input v-model="form.as" type="radio" value="fact"> Fact</label>
          <label><input v-model="form.as" type="radio" value="rule"> World rule</label>
        </fieldset>
        <div class="grid-form">
          <UiField v-if="form.as === 'fact'" label="Kind">
            <select v-model="form.kind">
              <option value="claim">Claim</option><option value="event">Event (for the timeline)</option><option value="character">Character</option>
              <option value="location">Location</option><option value="relationship">Relationship</option>
            </select>
          </UiField>
          <UiField :label="form.as === 'rule' ? 'What the rule is about' : 'Subject'"><input v-model="form.subject" type="text" maxlength="80" :placeholder="form.as === 'rule' ? 'e.g. Mars transit' : 'e.g. Victim'"></UiField>
          <template v-if="form.as === 'fact'">
            <UiField label="Predicate" hint="How they relate, e.g. died_at"><input v-model="form.predicate" type="text" maxlength="60"></UiField>
            <UiField label="Object" hint="Optional"><input v-model="form.object" type="text" maxlength="80"></UiField>
          </template>
        </div>
        <UiField label="Statement" hint="One sentence, as it should read in canon"><textarea v-model="form.statement" rows="2" maxlength="500" /></UiField>
        <div v-if="form.as === 'fact' && form.kind === 'event'" class="grid-form">
          <UiField label="Story time from" hint="e.g. D3 22:00"><input v-model="form.time_from" type="text" maxlength="40"></UiField>
          <UiField label="Story time to" hint="e.g. D4 02:00"><input v-model="form.time_to" type="text" maxlength="40"></UiField>
          <UiField label="Precision">
            <select v-model="form.precision"><option value="approximate">Approximate</option><option value="exact">Exact</option></select>
          </UiField>
        </div>
        <UiField label="Backed by these words from the note" hint="The candidate cites them; they must be in the note word for word">
          <select v-model="form.quote">
            <option v-for="s in sentences" :key="s" :value="s">{{ s.length > 140 ? `${s.slice(0, 139)}…` : s }}</option>
          </select>
        </UiField>
        <p v-if="promoteError" class="field-error" role="alert">{{ promoteError }}</p>
      </template>
      <template #actions>
        <template v-if="promoted">
          <UiButton to="/review" variant="primary">Open Review</UiButton>
          <UiButton @click="promoteOpen = false">Close</UiButton>
        </template>
        <template v-else>
          <UiButton @click="promoteOpen = false">Cancel</UiButton>
          <UiButton type="submit" variant="primary" :loading="busy === 'promote'" :disabled="!form.subject.trim() || !form.statement.trim() || !form.quote">Send to Review</UiButton>
        </template>
      </template>
    </UiDialog>

    <UiDialog v-model:open="pinOpen" title="Pin to a passage" @submit="savePin({ ...pin })">
      <p>Pin this note to the passage it is about. It stays a research note: pinning never changes the text or canon.</p>
      <UiField label="Document">
        <select v-model="pin.document_id">
          <option value="" disabled>Choose a document</option>
          <option v-for="d in docs.filter(d => d.origin !== 'research')" :key="d.id" :value="d.id">{{ d.title }}</option>
        </select>
      </UiField>
      <UiField label="Words from the passage" hint="Paste a phrase from the passage the note is about"><textarea v-model="pin.quote" rows="3" maxlength="1000" /></UiField>
      <p v-if="pinError" class="field-error" role="alert">{{ pinError }}</p>
      <template #actions>
        <UiButton @click="pinOpen = false">Cancel</UiButton>
        <UiButton type="submit" variant="primary" :loading="busy === 'pin'" :disabled="!pin.document_id || !pin.quote.trim()">Pin</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.page { gap: var(--s-4); max-width: 860px; }
.back { display: inline-flex; align-items: center; gap: 4px; font-size: var(--text-sm); color: var(--muted); text-decoration: none; }
.back:hover { color: var(--ink); }
.head { display: grid; gap: var(--s-2); }
.head h1 { margin: 0; font-size: var(--text-xl); line-height: 1.3; overflow-wrap: anywhere; }
.kicker { margin: 0; display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-xs); font-weight: 600; color: var(--research); text-transform: uppercase; letter-spacing: 0.04em; }
.meta { gap: var(--s-2); flex-wrap: wrap; }
.answer { border-left: 3px solid var(--research); display: grid; gap: var(--s-3); }
.answer p { margin: 0; }
.lead { font-size: var(--text-md); line-height: 1.6; }
.actions { gap: var(--s-2); flex-wrap: wrap; }
.pinned { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.linkish { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-decoration: underline; margin-left: var(--s-2); }
.cands ul { list-style: none; margin: var(--s-1) 0 0; padding: 0; display: grid; gap: var(--s-1); }
.cands li { display: flex; gap: var(--s-2); align-items: baseline; }
.claims, .sources { margin: 0; padding-left: 1.4em; display: grid; gap: var(--s-3); }
.sources { list-style: none; padding: 0; }
.claims li { display: grid; gap: 4px; }
.backing { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.ref { font-size: var(--text-xs); font-weight: 600; text-decoration: none; padding: 1px 6px; border-radius: var(--r-sm); background: var(--sunken); color: var(--muted); }
.ref.verified { background: var(--good-soft); color: var(--good); }
.ref.unverified { background: var(--bad-soft); color: var(--bad); }
.ref.not_checked { background: var(--warn-soft); color: var(--warn); }
.sources li { display: grid; gap: 6px; padding-bottom: var(--s-3); border-bottom: 1px solid var(--line); scroll-margin-top: 80px; }
.sources li:last-child { border-bottom: 0; padding-bottom: 0; }
.src-title { font-weight: 600; overflow-wrap: anywhere; }
.spread { gap: var(--s-2); }
.src-quote { margin: 0; padding: 8px 12px; border-left: 3px solid var(--good); background: var(--sunken); border-radius: 0 var(--r-md) var(--r-md) 0; font-size: var(--text-sm); }
.src-quote.unverified { border-left-color: var(--bad); text-decoration: underline wavy color-mix(in srgb, var(--bad) 55%, transparent); text-underline-offset: 4px; }
.src-quote.not_checked { border-left-color: var(--warn); }
.calcs { display: grid; gap: var(--s-3); }
.calc { border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--s-3); }
.calc summary { cursor: pointer; text-transform: capitalize; display: flex; gap: var(--s-2); align-items: center; }
.calc p { margin: var(--s-2) 0 0; overflow-wrap: anywhere; }
.result { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--s-2) var(--s-4); margin: var(--s-3) 0 0; }
.result dt { font-size: var(--text-xs); color: var(--faint); font-weight: 600; text-transform: capitalize; }
.result dd { margin: 0; font-size: var(--text-sm); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.assumptions { margin: var(--s-3) 0 0; padding-left: 1.2em; display: grid; gap: 2px; }
.trace { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.trace th, .trace td { text-align: left; padding: 6px 4px; border-bottom: 1px solid var(--line); vertical-align: top; }
.trace td:nth-child(3) { overflow-wrap: anywhere; }
.trace tr.failed td { color: var(--bad); }
.trace td:last-child { white-space: nowrap; }
.as { display: flex; gap: var(--s-4); border: 0; padding: 0; margin: 0; }
.as label { display: inline-flex; gap: 6px; align-items: center; color: var(--ink); }
.grid-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--s-3); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
