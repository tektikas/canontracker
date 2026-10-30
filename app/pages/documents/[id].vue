<script setup lang="ts">
const route = useRoute()
const { data: doc, error } = await useFetch(`/api/documents/${route.params.id}`)
// :target does not update on client-side navigation, so highlight from the route hash.
const active = computed(() => route.hash.slice(1))
const lineOf = (ev: Record<string, any>) => `Line ${ev.start_line}${ev.end_line !== ev.start_line ? `–${ev.end_line}` : ''}`
const here = (f: Record<string, any>) => f.evidence.filter((ev: any) => ev.document_id === doc.value?.id)
const activeQuote = computed(() => doc.value?.facts.flatMap(f => f.evidence).find(ev => ev.verified && ev.passage_id === active.value)?.quote)
</script>

<template>
  <UiPanel v-if="error">
    <UiEmptyState title="Document not found" icon="file">
      It may have been replaced by a newer import.
      <template #actions><UiButton to="/#sources">Back to sources</UiButton></template>
    </UiEmptyState>
  </UiPanel>
  <template v-else-if="doc">
    <nav class="crumbs small" aria-label="Breadcrumb">
      <NuxtLink to="/#sources">Sources</NuxtLink><span aria-hidden="true">/</span><span class="mono">{{ doc.filename }}</span>
    </nav>
    <UiPageHeader :title="doc.title">
      <span class="meta">
        <UiBadge>{{ doc.kind }}</UiBadge>
        <UiBadge>v{{ doc.version }}</UiBadge>
        <UiBadge tone="good" title="Story Bible never edits imported sources">Read-only source</UiBadge>
        <span class="mono faint" :title="`sha256 ${doc.sha256}`">sha256 {{ String(doc.sha256).slice(0, 12) }}…</span>
      </span>
    </UiPageHeader>

    <div class="layout">
      <UiPanel class="doc">
        <PassageReader :doc="doc" :active="active" :quote="activeQuote" />
      </UiPanel>

      <UiPanel as="aside" class="facts" title="Facts citing this document" :description="doc.facts.length ? `${doc.facts.length} canon or pending` : undefined">
        <p v-if="!doc.facts.length" class="small muted none">No canon facts or pending candidates cite this document.</p>
        <ul v-else class="fact-list">
          <li v-for="f in doc.facts" :key="f.id" :class="{ current: here(f).some((ev: any) => ev.passage_id === active) }">
            <div class="fact-top">
              <UiBadge :tone="f.status === 'canon' ? 'accent' : 'pencil'">{{ f.status === 'canon' ? 'Canon' : 'Pending review' }}</UiBadge>
              <template v-for="ev in here(f)" :key="ev.id">
                <NuxtLink v-if="ev.passage_id" :to="`#${ev.passage_id}`" class="small line-link">{{ lineOf(ev) }}</NuxtLink>
                <span v-else class="small line-link bad">Quote not found in this source</span>
              </template>
            </div>
            <div class="statement">{{ f.statement }}</div>
            <NuxtLink v-if="f.status === 'pending'" :to="`/review?fact=${f.id}`" class="small">Review this candidate →</NuxtLink>
          </li>
        </ul>
      </UiPanel>
    </div>
  </template>
</template>

<style scoped>
.crumbs { display: flex; gap: var(--s-2); align-items: center; color: var(--muted); margin-bottom: var(--s-2); }
.crumbs a { color: var(--muted); }
.meta { display: inline-flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.layout { display: grid; gap: var(--s-4); grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; }
.doc { padding: var(--s-5) var(--s-4); align-self: stretch; }
.facts { position: sticky; top: var(--s-5); max-height: calc(100vh - 2 * var(--s-5)); overflow-y: auto; }
.none { margin: 0; }
.fact-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
.fact-list li { display: grid; gap: 6px; padding: var(--s-3); border-radius: var(--r-md); border: 1px solid var(--line); }
.fact-list li.current { border-color: var(--accent); background: var(--accent-soft); }
.fact-list .statement { font-size: var(--text-base); line-height: 1.5; }
.fact-top { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.line-link { color: var(--muted); font-variant-numeric: tabular-nums; }
.line-link.bad { color: var(--bad); text-decoration: none; }
@media (max-width: 900px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .facts { position: static; max-height: none; }
}
@media (max-width: 720px) {
  .doc { padding: var(--s-3) var(--s-2); }
}
</style>
