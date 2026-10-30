<script setup lang="ts">
// Story text with known entity names and aliases linked to their wiki pages. Resolved at read time from the project's
// pages; anything that isn't a known name stays plain text, so no link is ever invented.
const props = defineProps<{ text: string }>()
const lookup = useEntityLookup()
// On an entity's own page its name isn't linked to itself.
const route = useRoute()
const here = computed(() => (route.path.startsWith('/entities/') ? route.params.id : undefined))
const parts = computed(() => {
  const { pattern, byName } = lookup.value
  if (!pattern || !props.text) return [{ text: props.text, entity: undefined }]
  const out: { text: string, entity?: EntityListItem }[] = []
  let last = 0
  for (const m of props.text.matchAll(pattern)) {
    if (m.index > last) out.push({ text: props.text.slice(last, m.index) })
    const entity = byName.get(normName(m[0]))
    out.push({ text: m[0], entity: entity?.id === here.value ? undefined : entity })
    last = m.index + m[0].length
  }
  if (last < props.text.length) out.push({ text: props.text.slice(last) })
  return out
})
</script>

<template><template v-for="(p, i) in parts" :key="i"><EntityMention v-if="p.entity" :entity="p.entity">{{ p.text }}</EntityMention><template v-else>{{ p.text }}</template></template></template>
