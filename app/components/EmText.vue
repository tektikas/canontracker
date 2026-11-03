<script setup lang="ts">
// Text with its Markdown emphasis (`_x_`, `*x*`, `**x**`) set in italics or bold and the delimiters left out. For quotes and
// book pages, where the text is shown but never selected against offsets (the reader uses StoryText, which keeps them).
// Data only: no links, no requests, so it renders the same in print and on share pages.
const props = defineProps<{ text: string }>()
const runs = computed(() => emphasisRuns(props.text).filter(r => !r.mark))
</script>

<template><template v-for="r in runs" :key="r.start"><component :is="r.strong ? 'strong' : 'em'" v-if="r.em || r.strong" :class="{ both: r.em && r.strong }">{{ r.text }}</component><template v-else>{{ r.text }}</template></template></template>

<style scoped>
.both { font-style: italic; }
</style>
