<script setup lang="ts">
const props = defineProps<{ fact: Record<string, any>, sources?: boolean }>()
// Facts a person added from a passage say so, apart from model-proposed ones: "Added by Ada from Harbor Night, line 12".
const authored = computed(() => {
  if (props.fact.origin !== 'human') return ''
  const ev = props.fact.evidence?.[0]
  const where = ev ? ` from ${ev.document_title}${ev.start_line ? `, line ${ev.start_line}` : ''}` : ''
  return `Added by ${props.fact.created_by_name ?? 'a teammate'}${where}`
})
</script>

<template>
  <div class="fact">
    <div class="row">
      <UiBadge :tone="fact.status === 'pending' ? 'pencil' : 'accent'">{{ fact.kind }}</UiBadge>
      <UiBadge v-if="fact.time_label" :tone="fact.precision === 'approximate' ? 'warn' : 'neutral'" :title="fact.precision === 'approximate' ? 'Approximate time' : undefined">{{ fact.time_label }}</UiBadge>
      <UiBadge v-if="fact.version > 1">v{{ fact.version }}</UiBadge>
    </div>
    <div class="statement"><MentionText :text="fact.statement" /></div>
    <div v-if="authored" class="authored small"><UiIcon name="review" :size="13" />{{ authored }}</div>
    <div class="triple">{{ fact.subject }} → {{ fact.predicate }}<template v-if="fact.object"> → {{ fact.object }}</template></div>
    <div v-if="sources && fact.evidence?.length" class="fact-sources">
      <SourceRef v-for="ev in fact.evidence" :key="ev.id" :ev="ev" />
    </div>
  </div>
</template>

<style scoped>
.fact { display: grid; gap: 6px; min-width: 0; }
.authored { display: flex; align-items: center; gap: 5px; color: var(--muted); }
.authored svg { flex: none; color: var(--faint); }
.fact-sources { display: grid; gap: var(--s-3); margin-top: 6px; }
</style>
