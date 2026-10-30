<script setup lang="ts">
const route = useRoute()
const { data: canon, refresh: refreshCanon } = await useFetch('/api/facts', { query: { status: 'canon' } })
const { data: changes, refresh } = await useFetch('/api/changes')

const targetId = ref(String(route.query.target ?? ''))
const target = computed(() => canon.value?.find(f => f.id === targetId.value))
const proposed = ref('')
const rationale = ref('')
const busy = ref(false)
const error = ref('')
watch(target, (t) => { proposed.value = t?.statement ?? '' }, { immediate: true })

const ui = reactive<Record<string, { rationale: string, error: string, busy: boolean }>>({})
const state = (id: string) => (ui[id] ??= { rationale: '', error: '', busy: false })
const STATUS_CHIP: Record<string, string> = { ready_for_review: 'warn', applied: 'good', rejected: 'bad', reverted: '' }

async function propose() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/changes', { method: 'POST', body: { target_fact_id: targetId.value, proposed_statement: proposed.value, rationale: rationale.value } })
    targetId.value = ''
    rationale.value = ''
    await Promise.all([refresh(), refreshNuxtData('stats')])
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function decide(id: string, decision: 'accept' | 'reject' | 'revert') {
  const s = state(id)
  s.busy = true
  s.error = ''
  try {
    if (decision === 'revert') await $fetch(`/api/changes/${id}/revert`, { method: 'POST', body: { rationale: s.rationale } })
    else await $fetch(`/api/changes/${id}/decision`, { method: 'POST', body: { decision, rationale: s.rationale } })
    s.rationale = ''
  } catch (e) {
    s.error = errorMessage(e)
    return
  } finally {
    s.busy = false
  }
  // Not awaited: a newer refresh cancels an older one, and a cancelled refresh never settles.
  refresh()
  refreshCanon()
  refreshNuxtData('stats')
}

const scenes = (c: Record<string, any>) => c.impact.filter((i: any) => i.target_type === 'scene')
const facts = (c: Record<string, any>) => c.impact.filter((i: any) => i.target_type === 'fact')
</script>

<template>
  <div class="page-head">
    <h1>Changes &amp; impact</h1>
    <p>Propose a new value for a canon fact and see what it may touch before anything changes. Analysis stays inside accepted canon, at most 2 hops away. Nothing is rewritten automatically.</p>
  </div>

  <form class="card stack" style="margin-bottom: 24px" @submit.prevent="propose">
    <h2>New proposal</h2>
    <label>Canon fact to change
      <select v-model="targetId">
        <option value="">Choose a fact…</option>
        <option v-for="f in canon" :key="f.id" :value="f.id">[{{ f.kind }}] {{ f.statement }}</option>
      </select>
    </label>
    <template v-if="target">
      <div class="small muted">Current: <span class="statement">{{ target.statement }}</span></div>
      <label>Proposed statement<textarea v-model="proposed" rows="2" /></label>
      <label>Why (required)<input v-model="rationale" type="text" placeholder="e.g. Make the memory rule conditional"></label>
    </template>
    <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
    <div><button class="btn primary" :disabled="busy || !target || !rationale.trim()">{{ busy ? 'Analyzing…' : 'Analyze impact' }}</button></div>
  </form>

  <div v-if="!changes?.length" class="card empty">No change proposals yet.</div>

  <div class="stack">
    <article v-for="c in changes" :key="c.id" class="card stack">
      <div class="spread">
        <span class="chip" :class="STATUS_CHIP[c.status]">{{ c.status.replaceAll('_', ' ') }}</span>
        <span class="small muted mono">{{ c.id }}</span>
      </div>
      <div class="stack" style="gap: 4px">
        <div class="statement diff-old">{{ c.before_statement }}</div>
        <div class="statement diff-new">{{ c.proposed_statement }}</div>
        <div class="small muted">Why: {{ c.rationale }}</div>
      </div>

      <div>
        <h3>Scenes to re-review ({{ scenes(c).length }})</h3>
        <p v-if="!scenes(c).length" class="small muted">No impact found within 2 hops. That is not a guarantee of no impact.</p>
        <div class="table-wrap">
          <table v-if="scenes(c).length">
            <thead><tr><th>Scene</th><th>Hops</th><th>Why</th><th>Confidence</th></tr></thead>
            <tbody>
              <tr v-for="i in scenes(c)" :key="i.target_id">
                <td><NuxtLink :to="`/documents/${i.target_id}`">{{ i.label }}</NuxtLink></td>
                <td>{{ i.hop_count }}</td>
                <td>{{ i.rationale }}<div class="path">{{ i.path.join(' → ') }}</div></td>
                <td>{{ percent(i.confidence) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <details v-if="facts(c).length">
        <summary>Dependent canon facts ({{ facts(c).length }})</summary>
        <ul class="small">
          <li v-for="i in facts(c)" :key="i.target_id">{{ i.label }} <span class="muted">· shares "{{ i.via }}"</span></li>
        </ul>
      </details>

      <div class="row small">
        <span class="muted">Export impact:</span>
        <a v-for="f in ['json', 'csv', 'md']" :key="f" :href="`/api/changes/${c.id}/export?format=${f}`">{{ f.toUpperCase() }}</a>
      </div>

      <template v-if="c.status === 'ready_for_review'">
        <label>Decision rationale (required)<input v-model="state(c.id).rationale" type="text" placeholder="e.g. Impact list reviewed with the writers"></label>
        <p v-if="state(c.id).error" class="notice bad" role="alert">{{ state(c.id).error }}</p>
        <div class="row">
          <button class="btn primary" :disabled="state(c.id).busy || !state(c.id).rationale.trim()" @click="decide(c.id, 'accept')">Accept &amp; apply</button>
          <button class="btn danger" :disabled="state(c.id).busy || !state(c.id).rationale.trim()" @click="decide(c.id, 'reject')">Reject</button>
        </div>
      </template>
      <template v-else>
        <p class="small muted" style="margin: 0">
          Decision: {{ c.decision_rationale }}
          <template v-if="c.status === 'applied'"> · new canon version created; the old fact is kept as superseded.</template>
        </p>
        <p v-if="c.status === 'reverted'" class="small muted" style="margin: 0">Reverted: {{ c.revert_rationale }} · the original wording is canon again as a new version.</p>
        <details v-if="c.status === 'applied'">
          <summary>Revert this change…</summary>
          <div class="stack" style="margin-top: 10px">
            <label>Why revert (required)<input v-model="state(c.id).rationale" type="text" placeholder="e.g. Playtest showed the old rule reads better"></label>
            <p v-if="state(c.id).error" class="notice bad" role="alert">{{ state(c.id).error }}</p>
            <div><button class="btn danger" :disabled="state(c.id).busy || !state(c.id).rationale.trim()" @click="decide(c.id, 'revert')">Revert to original</button></div>
          </div>
        </details>
      </template>
    </article>
  </div>
</template>
