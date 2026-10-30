<script setup lang="ts">
const { data: conflicts, refresh } = await useFetch('/api/conflicts')
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
const STATUS_CHIP: Record<string, string> = { open: 'warn', confirmed: 'bad', false_positive: 'good', uncertain: '' }

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
  <div class="page-head spread">
    <div>
      <h1>Conflict candidates</h1>
      <p>Narrow checks over accepted canon: timing, travel and relationships in code, world rules with the model's help. A hit is a "possible conflict" for you to judge; deciding never edits canon.</p>
    </div>
    <button class="btn primary" :disabled="scanning" @click="scan">{{ scanning ? 'Scanning…' : 'Scan canon' }}</button>
  </div>

  <p v-if="scanMsg" class="notice info" style="margin-bottom: 14px">{{ scanMsg }}</p>
  <p v-if="scanError" class="notice warn" role="alert" style="margin-bottom: 14px">{{ scanError }}</p>
  <div v-if="!conflicts?.length" class="card empty">No conflict candidates yet. Accept some canon, then scan.</div>

  <div class="stack">
    <article v-for="c in conflicts" :key="c.id" class="card stack">
      <div class="spread">
        <div class="row">
          <span class="chip" :class="STATUS_CHIP[c.status]">{{ c.status.replace('_', ' ') }}</span>
          <strong>{{ RULES[c.rule] ?? c.rule }}</strong>
          <span v-if="c.origin === 'model'" class="chip accent" :title="c.model_id ?? ''">Model-suggested</span>
          <span v-else class="chip">Rule-based</span>
          <span v-if="c.left.status !== 'canon' || c.right.status !== 'canon'" class="chip warn">Outdated: a fact here was superseded</span>
        </div>
        <span class="small muted">rule <span class="mono">{{ c.rule }}</span> · confidence {{ percent(c.confidence) }}</span>
      </div>
      <p class="muted" style="margin: 0">{{ c.rationale }}</p>
      <div class="grid-2">
        <div class="card" style="background: var(--bg)"><FactSummary :fact="c.left" sources /></div>
        <div class="card" style="background: var(--bg)"><FactSummary :fact="c.right" sources /></div>
      </div>
      <template v-if="c.status === 'open'">
        <label>Rationale (required)<input v-model="state(c.id).rationale" type="text" placeholder="e.g. One source gives only an approximate time"></label>
        <p v-if="state(c.id).error" class="notice bad" role="alert">{{ state(c.id).error }}</p>
        <div class="row">
          <button v-for="d in DECISIONS" :key="d.value" class="btn" :class="d.cls" :disabled="state(c.id).busy || !state(c.id).rationale.trim()" @click="decide(c.id, d.value)">{{ d.label }}</button>
        </div>
      </template>
      <p v-else class="small muted" style="margin: 0">Decision: {{ c.decision_rationale }}</p>
    </article>
  </div>
</template>
