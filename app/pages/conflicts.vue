<script setup lang="ts">
// Viewers read only; the server refuses their writes too (server/middleware/access.ts).
const editor = computed(() => canEdit(useMe().value))
const { data: conflicts, refresh } = await useFetch('/api/conflicts')
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const since = (iso: string) => new Date(iso).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })
const scanning = ref(false)
const scanMsg = ref('')
const scanError = ref('')
const scanned = useState('conflicts-scanned', () => false) // read by Home's workflow rail
const ui = reactive<Record<string, { rationale: string, error: string, busy: boolean }>>({})
const state = (id: string) => (ui[id] ??= { rationale: '', error: '', busy: false })

const RULES: Record<string, string> = {
  EXACT_TIME_LOCATION_OVERLAP: 'Same person, two places, overlapping exact times',
  APPROX_TIME_LOCATION_OVERLAP: 'Same person, two places, overlapping approximate times',
  RELATIONSHIP_AFTER_END: 'Relationship used after it ended',
  TRAVEL_TIME_TOO_SHORT: 'Not enough time to travel between places',
  WORLD_RULE_VIOLATION: 'Fact breaks a world rule',
}
const DECISIONS = [
  { value: 'confirmed', label: 'Confirm conflict', cls: 'danger' },
  { value: 'false_positive', label: 'False alarm', cls: 'good' },
  { value: 'uncertain', label: 'Uncertain', cls: '' },
]
const STATUS_TONE: Record<string, string> = { open: 'warn', confirmed: 'bad', false_positive: 'good', uncertain: 'neutral', resolved_by_merge: 'good' }
const STATUS_LABEL: Record<string, string> = { open: 'Open', confirmed: 'Confirmed conflict', false_positive: 'False alarm', uncertain: 'Uncertain', resolved_by_merge: 'Resolved by merge' }
const view = ref('open')
const tabs = computed(() => [
  { value: 'open', label: 'To judge', count: (conflicts.value ?? []).filter(c => c.status === 'open').length },
  { value: 'decided', label: 'Decided', count: (conflicts.value ?? []).filter(c => c.status !== 'open').length },
])
const shown = computed(() => (conflicts.value ?? []).filter(c => (view.value === 'open') === (c.status === 'open')))
const level = (n: number) => (n >= 0.8 ? 'High' : n >= 0.5 ? 'Medium' : 'Low')

async function scan() {
  scanning.value = true
  try {
    const r = await $fetch('/api/conflicts/scan', { method: 'POST' })
    scanned.value = true
    scanMsg.value = r.created ? `${r.created} new conflict candidate${r.created > 1 ? 's' : ''}.` : 'Scan ran: no new conflict candidates.'
    scanError.value = r.model_error ? `Rule-based checks ran, but the model-assisted world-rule check failed: ${r.model_error}` : ''
    await Promise.all([refresh(), refreshNuxtData('stats')])
  } finally {
    scanning.value = false
  }
}

async function decide(id: string, decision: string) {
  const s = state(id)
  s.busy = true
  s.error = ''
  try {
    await $fetch(`/api/conflicts/${id}/decision`, { method: 'POST', body: { decision, rationale: s.rationale } })
  } catch (e) {
    s.error = errorMessage(e)
    return
  } finally {
    s.busy = false
  }
  // Not awaited: a newer refresh cancels an older one, and a cancelled refresh never settles.
  refresh()
  refreshNuxtData('stats')
}
</script>

<template>
  <UiPageHeader title="Conflict candidates" description="Narrow checks over accepted canon: timing, travel and relationships in code, world rules with the model's help. A hit is a possible conflict for you to judge. Deciding never edits canon.">
    <template v-if="editor" #actions><UiButton variant="primary" :loading="scanning" @click="scan">{{ scanning ? 'Scanning…' : 'Scan canon' }}</UiButton></template>
  </UiPageHeader>

  <p v-if="scanMsg" class="notice info" role="status">{{ scanMsg }}</p>
  <p v-if="scanError" class="notice warn" role="alert">{{ scanError }}</p>

  <UiEmptyState v-if="!conflicts?.length && !stats?.canon" title="No canon to check yet" icon="conflicts">
    Conflicts are found in accepted canon. Accept candidates in Review, then scan.
    <template #actions><UiButton variant="primary" to="/review">Review candidates</UiButton></template>
  </UiEmptyState>
  <UiEmptyState v-else-if="!conflicts?.length && stats?.last_scan" title="No conflicts found" icon="check">
    The last scan checked {{ counted(stats.last_scan.facts, 'canon fact') }} on {{ since(stats.last_scan.at) }}.
    <template v-if="stats.canon !== stats.last_scan.facts">Canon has {{ stats.canon }} facts now; scan again to check them.</template>
    <template v-if="editor" #actions><UiButton :loading="scanning" @click="scan">Scan again</UiButton></template>
  </UiEmptyState>
  <UiEmptyState v-else-if="!conflicts?.length" title="Not scanned yet" icon="conflicts">
    Scan {{ counted(stats?.canon ?? 0, 'canon fact') }} for timing, travel and relationship conflicts.
    <template v-if="editor" #actions><UiButton variant="primary" :loading="scanning" @click="scan">Scan canon</UiButton></template>
  </UiEmptyState>

  <template v-else>
    <UiTabs v-model="view" :items="tabs" />
    <p v-if="!shown.length" class="muted empty-note">{{ view === 'open' ? 'Nothing left to judge. Scan again after canon changes.' : 'No decisions yet.' }}</p>

    <div class="list">
      <article v-for="c in shown" :key="c.id" class="conflict" :class="{ model: c.origin === 'model' }">
        <header class="head">
          <div class="row">
            <UiBadge :tone="STATUS_TONE[c.status] as any" dot>{{ STATUS_LABEL[c.status] }}</UiBadge>
            <UiBadge v-if="c.origin === 'model'" tone="pencil" :title="c.model_id ?? ''">Model-suggested · {{ modelLabel(c.model_id) }}</UiBadge>
            <UiBadge v-else>Rule-based</UiBadge>
            <UiBadge v-if="c.left.status !== 'canon' || c.right.status !== 'canon'" tone="warn">Outdated: a fact here was superseded</UiBadge>
          </div>
          <div class="conf" :title="`Confidence ${percent(c.confidence)}`">
            <span class="small muted">{{ level(c.confidence) }} confidence · {{ percent(c.confidence) }}</span>
            <span class="meter"><span :style="{ width: percent(c.confidence) }" /></span>
          </div>
        </header>
        <h2>{{ RULES[c.rule] ?? c.rule }}</h2>
        <p class="clash"><UiIcon name="conflicts" :size="16" /><span>{{ c.rationale }}</span></p>
        <div class="sides">
          <section><h3>Source A</h3><FactSummary :fact="c.left" sources /></section>
          <div class="vs" aria-hidden="true">vs</div>
          <section><h3>Source B</h3><FactSummary :fact="c.right" sources /></section>
        </div>
        <footer v-if="c.status === 'open' && !editor" class="decide small muted">Open · waiting for an editor to decide.</footer>
        <footer v-else-if="c.status === 'open'" class="decide">
          <UiField label="Your rationale (required)" :error="state(c.id).error">
            <input v-model="state(c.id).rationale" type="text" placeholder="e.g. One source gives only an approximate time">
          </UiField>
          <div class="row">
            <UiButton v-for="d in DECISIONS" :key="d.value" :variant="(d.cls || 'secondary') as any" :disabled="state(c.id).busy || !state(c.id).rationale.trim()" @click="decide(c.id, d.value)">{{ d.label }}</UiButton>
          </div>
        </footer>
        <footer v-else-if="c.status === 'resolved_by_merge'" class="decide small muted">
          <span>{{ c.decided_by_name ? `Closed by ${c.decided_by_name}’s merge` : 'Closed by a merge' }}: {{ c.decision_rationale }}</span>
          <NuxtLink v-if="c.merge_audit_id" :to="`/audit#${c.merge_audit_id}`">See the merge in the audit trail</NuxtLink>
        </footer>
        <footer v-else class="decide small muted"><template v-if="c.decided_by_name">Decided by {{ c.decided_by_name }} · </template>{{ c.decision_rationale }}</footer>
      </article>
    </div>
  </template>
</template>

<style scoped>
.notice { margin-bottom: var(--s-4); }
.empty-note { margin: var(--s-5) 0; }
.list { display: grid; gap: var(--s-5); margin-top: var(--s-4); }
.conflict { background: var(--raised); border: 1px solid var(--line); border-left: 3px solid var(--bad); border-radius: var(--r-lg); padding: var(--s-4) var(--s-5); display: grid; gap: var(--s-3); min-width: 0; }
.conflict.model { border-left: 3px dashed var(--pencil); }
.head { display: flex; justify-content: space-between; gap: var(--s-3); flex-wrap: wrap; align-items: center; }
h2 { margin: 0; font-size: var(--text-lg); }
h3 { margin: 0 0 var(--s-2); font-size: var(--text-xs); color: var(--faint); font-weight: 600; }
.clash { display: flex; gap: var(--s-2); margin: 0; padding: var(--s-3); background: var(--bad-soft); color: var(--ink); border-radius: var(--r-md); font-size: var(--text-sm); }
.clash :deep(svg) { color: var(--bad); flex: none; margin-top: 2px; }
.conf { display: grid; gap: 4px; justify-items: end; }
.meter { width: 120px; height: 4px; background: var(--sunken); border-radius: 2px; overflow: hidden; }
.meter span { display: block; height: 100%; background: var(--ink); }
.sides { display: grid; grid-template-columns: 1fr auto 1fr; gap: var(--s-3); align-items: start; }
.sides section { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--s-3); min-width: 0; }
.vs { align-self: center; color: var(--faint); font-size: var(--text-xs); font-weight: 600; }
.decide { border-top: 1px solid var(--line); padding-top: var(--s-3); display: grid; gap: var(--s-3); }
@media (max-width: 720px) {
  .sides { grid-template-columns: 1fr; }
  .conf { justify-items: start; }
}
</style>
