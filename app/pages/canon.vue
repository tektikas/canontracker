<script setup lang="ts">
const { data: canon } = await useFetch('/api/facts', { query: { status: 'canon' } })
const { data: superseded } = await useFetch('/api/facts', { query: { status: 'superseded' } })

const tab = ref<'facts' | 'graph' | 'entities' | 'timeline' | 'superseded'>('facts')
const filter = ref('')
const KINDS = ['rule', 'character', 'relationship', 'event', 'location', 'claim']

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return (canon.value ?? []).filter(f => !q || `${f.statement} ${f.subject} ${f.object ?? ''}`.toLowerCase().includes(q))
})
const groups = computed(() => KINDS.map(kind => ({ kind, facts: filtered.value.filter(f => f.kind === kind) })).filter(g => g.facts.length))
const entities = computed(() => {
  const counts = new Map<string, number>()
  for (const f of canon.value ?? []) for (const e of [f.subject, f.object]) if (e) counts.set(e, (counts.get(e) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
})
function showEntity(name: string) {
  filter.value = name
  tab.value = 'facts'
}
const timeline = computed(() => filtered.value.filter(f => f.t_from != null || f.t_to != null)
  .sort((a, b) => (a.t_from ?? a.t_to ?? 0) - (b.t_from ?? b.t_to ?? 0)))
</script>

<template>
  <div class="page-head">
    <h1>Canon</h1>
    <p>Only facts a person accepted. Every fact links to the exact passage it came from.</p>
  </div>

  <div class="tabs" role="tablist">
    <button role="tab" :aria-selected="tab === 'facts'" @click="tab = 'facts'">Facts ({{ canon?.length ?? 0 }})</button>
    <button role="tab" :aria-selected="tab === 'graph'" @click="tab = 'graph'">Graph</button>
    <button role="tab" :aria-selected="tab === 'entities'" @click="tab = 'entities'">Entities ({{ entities.length }})</button>
    <button role="tab" :aria-selected="tab === 'timeline'" @click="tab = 'timeline'">Timeline</button>
    <button role="tab" :aria-selected="tab === 'superseded'" @click="tab = 'superseded'">Superseded ({{ superseded?.length ?? 0 }})</button>
  </div>

  <div v-if="tab === 'facts' || tab === 'timeline'" class="row" style="margin-bottom: 14px; max-width: 420px; flex-wrap: nowrap">
    <input v-model="filter" type="search" placeholder="Filter by character, place, word…" aria-label="Filter canon">
    <button v-if="filter" class="btn" @click="filter = ''">Clear</button>
  </div>

  <div v-if="!canon?.length && tab !== 'superseded'" class="card empty">No canon yet. <NuxtLink to="/review">Review candidates →</NuxtLink></div>

  <template v-if="tab === 'facts'">
    <section v-for="g in groups" :key="g.kind" style="margin-bottom: 22px">
      <h2 style="text-transform: capitalize">{{ g.kind }}s</h2>
      <div class="stack">
        <div v-for="f in g.facts" :key="f.id" class="card stack">
          <FactSummary :fact="f" sources />
          <div><NuxtLink class="btn" :to="{ path: '/changes', query: { target: f.id } }">Propose change…</NuxtLink></div>
        </div>
      </div>
    </section>
  </template>

  <section v-else-if="tab === 'graph'" class="card">
    <EntityGraph v-if="canon?.length" :facts="canon" @select="showEntity" />
  </section>

  <section v-else-if="tab === 'entities'" class="card">
    <p class="small muted">Characters, places and objects named in canon. Pick one to see every fact about it with its sources.</p>
    <div class="row">
      <button v-for="[name, n] in entities" :key="name" class="btn" @click="showEntity(name)">{{ name }} <span class="chip">{{ n }}</span></button>
    </div>
  </section>

  <section v-else-if="tab === 'timeline'" class="card table-wrap">
    <table>
      <thead><tr><th>Story time</th><th>Fact</th><th>Source</th></tr></thead>
      <tbody>
        <tr v-for="f in timeline" :key="f.id">
          <td class="mono" style="white-space: nowrap">
            {{ f.time_label }}
            <div v-if="f.precision === 'approximate'"><span class="chip warn">approximate</span></div>
          </td>
          <td><div class="statement">{{ f.statement }}</div><div class="triple">{{ f.subject }} → {{ f.predicate }} → {{ f.object }}</div></td>
          <td class="small">
            <NuxtLink v-for="ev in f.evidence" :key="ev.id" :to="`/documents/${ev.document_id}#${ev.passage_id}`">{{ ev.document_title }}</NuxtLink>
          </td>
        </tr>
      </tbody>
    </table>
  </section>

  <section v-else class="stack">
    <div v-if="!superseded?.length" class="card empty">No superseded facts. Accepted change proposals keep the old version here.</div>
    <div v-for="f in superseded" :key="f.id" class="card stack">
      <span class="chip" style="width: fit-content">Superseded v{{ f.version }}</span>
      <FactSummary :fact="f" sources />
    </div>
  </section>
</template>
