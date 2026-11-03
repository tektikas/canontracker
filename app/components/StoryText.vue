<script setup lang="ts">
// A passage's text as the reader shows it: Markdown emphasis (`_x_`, `*x*`, `**x**`) in italics or bold, entity names linked
// (MentionText), and `mark` = [from, to) raw offsets highlighted (a cited quote). The delimiters stay in the DOM but are
// hidden, so every character of the stored text is still there in order: selection (which skips hidden text; the server folds
// emphasis when it checks a quote), find (which skips .md) and citation offsets all work on the text as stored.
const props = defineProps<{ text: string, mark?: [number, number] | null }>()
const zones = computed(() => {
  const [from, to] = props.mark ?? [-1, -1]
  const out: { hl: boolean, runs: EmphasisRun[] }[] = []
  for (const r of emphasisRuns(props.text)) {
    // Cut each run where the highlight starts and ends.
    const cuts = [r.start, ...[from, to].filter(c => c > r.start && c < r.start + r.text.length), r.start + r.text.length]
    for (let k = 0; k + 1 < cuts.length; k++) {
      const piece = { ...r, start: cuts[k]!, text: props.text.slice(cuts[k]!, cuts[k + 1]!) }
      const hl = piece.start >= from && piece.start < to
      const last = out.at(-1)
      if (last && last.hl === hl) last.runs.push(piece)
      else out.push({ hl, runs: [piece] })
    }
  }
  return out
})
</script>

<template><component :is="z.hl ? 'mark' : 'span'" v-for="(z, i) in zones" :key="i"><template v-for="r in z.runs" :key="r.start"><span v-if="r.mark" class="md" aria-hidden="true">{{ r.text }}</span><component :is="r.strong ? 'strong' : 'em'" v-else-if="r.em || r.strong" :class="{ both: r.em && r.strong }"><MentionText :text="r.text" /></component><MentionText v-else :text="r.text" /></template></component></template>

<style scoped>
.md { display: none; }
mark { background: color-mix(in srgb, var(--accent) 22%, transparent); color: inherit; border-radius: 2px; padding: 0 1px; }
.both { font-style: italic; }
</style>
