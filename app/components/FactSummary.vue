<script setup lang="ts">
defineProps<{ fact: Record<string, any>, sources?: boolean }>()
</script>

<template>
  <div class="fact">
    <div class="row">
      <UiBadge :tone="fact.status === 'pending' ? 'pencil' : 'accent'">{{ fact.kind }}</UiBadge>
      <UiBadge v-if="fact.time_label" :tone="fact.precision === 'approximate' ? 'warn' : 'neutral'" :title="fact.precision === 'approximate' ? 'Approximate time' : undefined">{{ fact.time_label }}</UiBadge>
      <UiBadge v-if="fact.version > 1">v{{ fact.version }}</UiBadge>
    </div>
    <div class="statement">{{ fact.statement }}</div>
    <div class="triple">{{ fact.subject }} → {{ fact.predicate }}<template v-if="fact.object"> → {{ fact.object }}</template></div>
    <div v-if="sources && fact.evidence?.length" class="fact-sources">
      <SourceRef v-for="ev in fact.evidence" :key="ev.id" :ev="ev" />
    </div>
  </div>
</template>

<style scoped>
.fact { display: grid; gap: 6px; min-width: 0; }
.fact-sources { display: grid; gap: var(--s-3); margin-top: 6px; }
</style>
