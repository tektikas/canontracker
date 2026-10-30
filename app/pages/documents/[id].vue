<script setup lang="ts">
const route = useRoute()
const { data: doc, error } = await useFetch(`/api/documents/${route.params.id}`)
// :target does not update on client-side navigation, so highlight from the route hash.
const active = computed(() => route.hash.slice(1))
</script>

<template>
  <div v-if="error" class="notice bad" style="margin-top: 24px">Document not found.</div>
  <template v-else-if="doc">
    <div class="page-head">
      <div class="row small muted" style="margin-bottom: 6px">
        <NuxtLink to="/">Documents</NuxtLink><span>/</span><span>{{ doc.filename }}</span>
      </div>
      <h1>{{ doc.title }}</h1>
      <div class="row">
        <span class="chip">{{ doc.kind }}</span>
        <span class="chip">v{{ doc.version }}</span>
        <span class="chip good">Read-only source</span>
        <span class="mono small muted">sha256 {{ String(doc.sha256).slice(0, 16) }}…</span>
      </div>
    </div>
    <div class="grid-2 doc-layout">
      <section class="card">
        <div v-for="p in doc.passages" :id="String(p.id)" :key="String(p.id)" class="passage" :class="{ active: active === p.id }">
          <span class="ln">L{{ p.start_line }}<template v-if="p.end_line !== p.start_line">–{{ p.end_line }}</template></span>
          <span class="text">{{ p.text }}</span>
        </div>
      </section>
      <section class="stack">
        <h2>Facts from this document</h2>
        <div v-if="!doc.facts.length" class="card empty">No canon or pending facts cite this document.</div>
        <div v-for="f in doc.facts" :key="f.id" class="card">
          <div class="row" style="margin-bottom: 6px">
            <span class="chip" :class="f.status === 'canon' ? 'good' : 'warn'">{{ f.status === 'canon' ? 'Canon' : 'Pending review' }}</span>
          </div>
          <FactSummary :fact="f" />
        </div>
      </section>
    </div>
  </template>
</template>
