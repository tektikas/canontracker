<script setup lang="ts">
defineProps<{ ev: Record<string, any> }>()
</script>

<template>
  <div class="stack" style="gap: 4px">
    <blockquote class="quote" :class="{ unverified: !ev.verified, prior: ev.support === 'prior_source' }">{{ ev.quote }}</blockquote>
    <div class="row small muted">
      <NuxtLink v-if="ev.passage_id" :to="`/documents/${ev.document_id}#${ev.passage_id}`">
        {{ ev.document_title }} · v{{ ev.document_version }} · L{{ ev.start_line }}<template v-if="ev.end_line !== ev.start_line">–{{ ev.end_line }}</template>
      </NuxtLink>
      <NuxtLink v-else :to="`/documents/${ev.document_id}`">{{ ev.document_title }}</NuxtLink>
      <span v-if="!ev.verified" class="chip bad">Quote not found in source</span>
      <span v-else-if="ev.support === 'prior_source'" class="chip">Prior source (wording changed)</span>
      <span v-else class="chip good">Verbatim match</span>
      <span v-if="ev.latest_version > ev.document_version" class="chip warn" :title="`Cites v${ev.document_version}; the source now has v${ev.latest_version}. Re-check before relying on it.`">Stale: source now v{{ ev.latest_version }}</span>
    </div>
  </div>
</template>
