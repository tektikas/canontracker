<script setup lang="ts">
defineProps<{ fact: Record<string, any>, sources?: boolean }>()
</script>

<template>
  <div class="stack" style="gap: 6px">
    <div class="row">
      <span class="chip accent">{{ fact.kind }}</span>
      <span v-if="fact.time_label" class="chip" :class="{ warn: fact.precision === 'approximate' }">{{ fact.time_label }}</span>
      <span v-if="fact.version > 1" class="chip">v{{ fact.version }}</span>
    </div>
    <div class="statement">{{ fact.statement }}</div>
    <div class="triple">{{ fact.subject }} → {{ fact.predicate }}<template v-if="fact.object"> → {{ fact.object }}</template></div>
    <template v-if="sources">
      <SourceRef v-for="ev in fact.evidence" :key="ev.id" :ev="ev" />
    </template>
  </div>
</template>
