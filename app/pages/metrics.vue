<script setup lang="ts">
const { data: runs, refresh } = await useFetch('/api/eval')
const { data: calls, refresh: refreshCalls } = await useFetch('/api/model-calls')
const busy = ref(false)
const error = ref('')
const latest = computed(() => runs.value?.[0])

async function run() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/eval', { method: 'POST' })
  } catch (e) {
    error.value = errorMessage(e)
    return
  } finally {
    busy.value = false
  }
  refresh()
  refreshCalls()
  refreshNuxtData('stats')
}

const verdict = (pass: boolean | null) => pass === null ? { cls: '', label: 'info' } : pass ? { cls: 'good', label: 'met' } : { cls: 'bad', label: 'missed' }
const tally = (results: { pass: boolean | null }[]) => `${results.filter(r => r.pass).length}/${results.filter(r => r.pass !== null).length} met`
</script>

<template>
  <div class="page-head spread">
    <div>
      <h1>Measurements</h1>
      <p>Targets from the MVP acceptance list, measured on the current data against a hand-labeled gold set for Broken Tide. A small synthetic set checks that the system behaves as designed; it is not evidence of real-world accuracy.</p>
    </div>
    <button class="btn primary" :disabled="busy" @click="run">{{ busy ? 'Measuring…' : 'Run evaluation' }}</button>
  </div>

  <p v-if="error" class="notice bad" role="alert" style="margin-bottom: 14px">{{ error }}</p>

  <div v-if="!latest" class="card empty">
    Not run yet. For a full run: load the demo set, review candidates, scan conflicts and decide A1, then run the evaluation.
  </div>

  <section v-else class="card stack" style="margin-bottom: 24px">
    <div class="spread">
      <h2 style="margin: 0">Latest run · {{ tally(latest.results) }}</h2>
      <span class="small muted">{{ new Date(latest.created_at).toLocaleString() }} · dataset <span class="mono">{{ latest.dataset }}</span> · model <span class="mono">{{ latest.model_id }}</span></span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Measure</th><th>Target</th><th>Measured</th><th>Result</th></tr></thead>
        <tbody>
          <tr v-for="m in latest.results" :key="m.key">
            <td>{{ m.label }}<div v-if="m.note" class="small muted">{{ m.note }}</div></td>
            <td class="mono small">{{ m.target }}</td>
            <td class="mono small">{{ m.measured }}</td>
            <td><span class="chip" :class="verdict(m.pass).cls">{{ verdict(m.pass).label }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section v-if="runs && runs.length > 1" class="card" style="margin-bottom: 24px">
    <h2>Earlier runs</h2>
    <ul class="small">
      <li v-for="r in runs.slice(1)" :key="r.id">{{ new Date(r.created_at).toLocaleString() }} · {{ tally(r.results) }} · <span class="mono">{{ r.model_id }}</span></li>
    </ul>
  </section>

  <section class="card stack">
    <h2 style="margin: 0">Model calls</h2>
    <p class="small muted" style="margin: 0">Every model call: what it was for, which sources it saw, how long it took. Prompts, keys and full documents are not stored.</p>
    <div v-if="!calls?.length" class="empty">No model calls yet.</div>
    <div v-else class="table-wrap">
      <table>
        <thead><tr><th>Time</th><th>Purpose</th><th>Model · prompt</th><th>Inputs</th><th>Result</th><th>Latency</th></tr></thead>
        <tbody>
          <tr v-for="c in calls" :key="c.id">
            <td class="mono small" style="white-space: nowrap">{{ new Date(c.created_at).toLocaleTimeString() }}</td>
            <td><span class="chip accent">{{ c.purpose.replace('_', ' ') }}</span></td>
            <td class="mono small">{{ c.model_id }}<div class="muted">{{ c.prompt_version }}</div></td>
            <td class="small">{{ c.input_refs.length }} {{ c.target_type === 'document' ? 'document' : 'facts' }}</td>
            <td class="small">
              <span v-if="c.status === 'ok'">{{ c.output_summary }}</span>
              <span v-else class="chip bad" :title="c.error ?? ''">failed</span>
            </td>
            <td class="mono small">{{ c.latency_ms }} ms</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
