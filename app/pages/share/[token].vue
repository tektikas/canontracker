<script setup lang="ts">
import { setResponseStatus } from 'h3'
// Public, read-only story bible behind a share link. No app chrome and no app requests: one call to /api/public/share.
definePageMeta({ layout: false })
const token = useRoute().params.token as string
const { data: bible, error } = await useFetch<Bible & { expires_at: string | null }>(`/api/public/share/${encodeURIComponent(token)}`)
useHead(() => ({
  title: bible.value ? `${bible.value.title} · Story bible` : 'Link not available · Story Bible',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }],
}))
const expired = computed(() => error.value?.statusCode === 410)
// The page answers with the API's status too (404 turned off or unknown, 410 expired), so the link reads as gone everywhere.
if (import.meta.server && error.value) setResponseStatus(useRequestEvent()!, error.value.statusCode ?? 404)
const print = () => window.print()
</script>

<template>
  <div class="share">
    <header class="bar no-print">
      <div class="bar-in">
        <span class="ro"><UiIcon name="lock" :size="15" />Read-only<template v-if="bible"> · shared by {{ bible.studio }}</template></span>
        <span v-if="bible" class="small muted exp">{{ bible.expires_at ? `Link expires ${shortDate(bible.expires_at)}` : '' }}</span>
        <UiButton v-if="bible" size="sm" icon="canon" @click="print">Print or save PDF</UiButton>
      </div>
    </header>
    <main class="doc">
      <BibleView v-if="bible" :bible="bible" />
      <div v-else class="gone">
        <UiEmptyState :title="expired ? 'This link has expired' : 'This link isn’t available'" icon="lock">
          {{ expired ? 'Its time ran out.' : 'It may have been turned off, or the address is incomplete.' }} Ask the person who shared it for a new link.
        </UiEmptyState>
      </div>
    </main>
    <footer class="foot small faint no-print"><BrandMark />Story Bible · human-approved, source-cited canon</footer>
  </div>
</template>

<style scoped>
.share { min-height: 100vh; display: flex; flex-direction: column; background: var(--canvas); }
.bar { position: sticky; top: 0; z-index: 2; border-bottom: 1px solid var(--line); background: var(--surface); }
.bar-in { max-width: 940px; margin: 0 auto; display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) 40px; min-height: 52px; }
.ro { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: var(--text-sm); }
.ro svg { color: var(--accent); }
.exp { margin-left: auto; }
.doc { flex: 1; width: 100%; max-width: 940px; margin: var(--s-6) auto; padding: var(--s-7) 40px; background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); }
.gone { padding: var(--s-7) 0; }
.foot { display: flex; align-items: center; justify-content: center; gap: var(--s-2); padding: var(--s-4) 0 var(--s-6); }
.foot :deep(.brand-mark) { width: 18px; height: 18px; }
@media (max-width: 720px) {
  .bar { position: static; }
  .bar-in { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px var(--s-3); padding: var(--s-2) var(--s-4); }
  .exp { margin-left: 0; grid-row: 2; }
  .bar-in :deep(.btn) { grid-column: 2; grid-row: 1 / span 2; }
  .doc { margin: 0; padding: var(--s-5) var(--s-4); border: 0; border-radius: 0; }
}
@media print {
  .no-print { display: none !important; }
  .share { background: none; }
  .doc { max-width: none; margin: 0; padding: 0; border: 0; background: none; }
}
</style>

<style>
@page { size: A4; margin: 16mm 14mm; }
@media print { html, body { background: var(--raised); } }
</style>
