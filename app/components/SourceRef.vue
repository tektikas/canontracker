<script setup lang="ts">
defineProps<{ ev: Record<string, any> }>()
</script>

<template>
  <figure class="source">
    <blockquote class="quote" :class="{ unverified: !ev.verified, prior: ev.support === 'prior_source' }">{{ ev.quote }}</blockquote>
    <figcaption class="source-meta">
      <NuxtLink v-if="ev.passage_id" :to="`/documents/${ev.document_id}#${ev.passage_id}`" class="source-link">
        <UiIcon name="file" :size="14" />{{ ev.document_title }}
        <span class="faint"><template v-if="ev.document_folder">{{ ev.document_folder }} · </template>v{{ ev.document_version }}, <template v-if="ev.start_ms != null">at {{ clockMs(ev.start_ms) }}</template><template v-else>line {{ ev.start_line }}<template v-if="ev.end_line !== ev.start_line">–{{ ev.end_line }}</template></template></span>
      </NuxtLink>
      <ClipButton v-if="ev.start_ms != null && ev.passage_id" :doc-id="ev.document_id" :start="ev.start_ms" :end="ev.end_ms" label="Play" />
      <NuxtLink v-if="!ev.passage_id" :to="`/documents/${ev.document_id}`" class="source-link"><UiIcon name="file" :size="14" />{{ ev.document_title }}</NuxtLink>
      <UiBadge v-if="!ev.verified" tone="bad" dot>Quote not found in source</UiBadge>
      <UiBadge v-else-if="ev.support === 'prior_source'" tone="pencil">Prior source, wording changed</UiBadge>
      <UiBadge v-else tone="good" dot>Verbatim match</UiBadge>
      <!-- Canon citations of an older version say whether the quote survived (server/utils/recheck.ts); others just say stale. -->
      <UiBadge v-if="ev.recheck === 'outdated'" tone="bad" :title="`${ev.recheck_count ? 'The quote no longer sits in one place' : 'The quote no longer appears'} in v${ev.latest_version}. Re-check this citation.`">{{ quoteLost(ev.recheck_count ?? 0, ev.latest_version) }}</UiBadge>
      <UiBadge v-else-if="ev.recheck === 'unchanged'" tone="warn" :title="`The quote reads the same in v${ev.latest_version}${ev.recheck_line ? `, line ${ev.recheck_line}` : ''}. Confirm to cite v${ev.latest_version}.`">Same quote in v{{ ev.latest_version }}</UiBadge>
      <UiBadge v-else-if="ev.recheck === 'kept'" :title="`${quoteLost(ev.recheck_count ?? 0, ev.latest_version)}; a person checked it and kept this citation.`">Kept on v{{ ev.document_version }} (checked v{{ ev.latest_version }})</UiBadge>
      <UiBadge v-else-if="ev.latest_version > ev.document_version" tone="warn" :title="`Cites v${ev.document_version}; the source now has v${ev.latest_version}. Re-check before relying on it.`">Stale: source now v{{ ev.latest_version }}</UiBadge>
    </figcaption>
  </figure>
</template>

<style scoped>
.source { margin: 0; display: grid; gap: 6px; min-width: 0; }
.source-meta { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: var(--text-sm); }
.source-link { display: inline-flex; align-items: center; gap: 6px; color: var(--ink); text-decoration: none; font-weight: 500; overflow-wrap: anywhere; }
.source-link:hover { color: var(--accent); }
.source-link .faint { font-weight: 400; }
</style>
