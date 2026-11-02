<script setup lang="ts">
// Print-ready story bible: the browser's "Save as PDF" turns it into the PDF export. No app chrome; the toolbar doesn't print.
// ?print=1 (from Export) opens the print dialog once fonts and portraits have loaded.
definePageMeta({ layout: false })
const route = useRoute()
const params = computed(() => new URLSearchParams(Object.entries(route.query).filter(([k, v]) => k !== 'print' && typeof v === 'string') as [string, string][]).toString())
const asBook = computed(() => route.query.book === 'bible' || route.query.book === 'manuscript')
const { data: bible, error } = await useFetch<Bible | Manuscript>(() => `/api/export/bible?${params.value}&format=json`)
useHead(() => ({ title: bible.value ? `${bible.value.title} · ${route.query.book === 'manuscript' ? 'Manuscript' : 'Story bible'}` : 'Story bible' }))
const book = computed(() => (!bible.value || !asBook.value ? null : route.query.book === 'manuscript' ? manuscriptBook(bible.value as Manuscript) : bibleBook(bible.value as Bible)))
const back = computed(() => `/export?${params.value}`)
// Only a press of Save as PDF (or the auto-print after it on Export) is audited, not every preview load.
const print = async () => {
  await $fetch(`/api/export/bible?${params.value}&format=json&for=printed`).catch(() => {})
  window.print()
}
onMounted(async () => {
  if (route.query.print !== '1' || !bible.value) return
  await document.fonts.ready
  await Promise.all([...document.images].map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r }))))
  print()
})
</script>

<template>
  <div class="print-page">
    <div class="toolbar no-print">
      <UiButton variant="ghost" icon="arrow" :to="back" class="back">Back to export</UiButton>
      <span class="small muted hint">Choose “Save as PDF” as the printer.</span>
      <UiButton variant="primary" icon="canon" :disabled="!bible" @click="print">Save as PDF</UiButton>
    </div>
    <main class="doc" :class="{ book: !!book }">
      <BookView v-if="book" :book="book" />
      <BibleView v-else-if="bible" :bible="bible as Bible" />
      <UiEmptyState v-else title="This export can’t be built" icon="conflicts">{{ (error?.data as { message?: string } | undefined)?.message ?? 'Go back and check what goes in.' }}</UiEmptyState>
    </main>
  </div>
</template>

<style scoped>
.print-page { min-height: 100vh; background: var(--canvas); }
.toolbar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) var(--s-5); border-bottom: 1px solid var(--line); background: var(--surface); }
.back :deep(svg) { transform: scaleX(-1); }
.hint { margin-left: auto; }
.doc { max-width: 940px; margin: var(--s-6) auto; padding: var(--s-7) 40px; background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); }
@media (max-width: 720px) {
  .toolbar { padding: var(--s-2) var(--s-4); }
  .hint { display: none; }
  .toolbar :deep(.btn.primary) { margin-left: auto; }
  .doc { margin: 0; padding: var(--s-5) var(--s-4); border: 0; border-radius: 0; }
}
@media print {
  .no-print { display: none !important; }
  .print-page { background: none; min-height: 0; }
  .doc { max-width: none; margin: 0; padding: 0; border: 0; background: none; }
}
</style>

<style>
@page { size: A4; margin: 16mm 14mm; }
@media print { html, body { background: var(--raised); } #teleports { display: none; } }
</style>
