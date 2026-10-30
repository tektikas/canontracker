<script setup lang="ts">
const { data: events } = await useFetch('/api/audit')
const filter = ref('')
const shown = computed(() => (events.value ?? []).filter(e => !filter.value || e.event_type.startsWith(filter.value)))
const types = computed(() => [...new Set((events.value ?? []).map(e => e.event_type.split('.')[0]!))])

const summary = (d: Record<string, unknown>) => {
  const v = d.rationale ?? d.statement ?? d.question ?? d.after ?? d.filename ?? d.rule ?? d.error ?? ''
  return typeof v === 'string' ? v : JSON.stringify(v)
}
</script>

<template>
  <div class="page-head spread">
    <div>
      <h1>Audit trail</h1>
      <p>Append-only log of imports, proposals, human decisions and canon changes.</p>
    </div>
    <div class="row">
      <a class="btn" href="/api/audit/export?format=json">Export JSON</a>
      <a class="btn" href="/api/audit/export?format=md">Export Markdown</a>
    </div>
  </div>

  <div class="row" style="margin-bottom: 12px">
    <button class="chip" :class="{ accent: !filter }" style="border: 0; cursor: pointer" @click="filter = ''">all</button>
    <button v-for="t in types" :key="t" class="chip" :class="{ accent: filter === t }" style="border: 0; cursor: pointer" @click="filter = t">{{ t }}</button>
  </div>

  <div v-if="!shown.length" class="card empty">No events yet.</div>
  <section v-else class="card table-wrap">
    <table>
      <thead><tr><th>Time</th><th>Event</th><th>Actor</th><th>Target</th><th>Detail</th></tr></thead>
      <tbody>
        <tr v-for="e in shown" :key="e.id">
          <td class="mono small" style="white-space: nowrap">{{ new Date(e.created_at).toLocaleTimeString() }}</td>
          <td><span class="chip">{{ e.event_type }}</span></td>
          <td class="small">{{ e.actor }}</td>
          <td class="mono small">{{ e.target_id }}</td>
          <td class="small">{{ summary(e.detail) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
