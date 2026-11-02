<script setup lang="ts">
// Plays one turn of a recording ("▶ 02:14"); pressing it again stops. Shared player: see useClip().
const props = defineProps<{ docId: string, start: number | null, end?: number | null, label?: string }>()
const clip = useClip()
const src = computed(() => `/api/documents/${props.docId}/audio`)
const key = computed(() => `${src.value}#${props.start}`)
const on = computed(() => clip.playing.value === key.value)
</script>

<template>
  <button
    type="button" class="clip" :class="{ on }" :aria-pressed="on"
    :aria-label="`${on ? 'Stop' : 'Play'} the recording at ${clockMs(start ?? 0)}`" :title="clip.error.value || (on ? 'Stop' : `Play from ${clockMs(start ?? 0)}`)"
    @click.stop.prevent="clip.play(src, start, end ?? null, key)"
  >
    <UiIcon :name="on ? 'stop' : 'play'" :size="12" /><span>{{ label ?? clockMs(start ?? 0) }}</span>
  </button>
</template>

<style scoped>
.clip {
  display: inline-flex; align-items: center; gap: 4px; min-height: 24px; padding: 0 6px; border: 1px solid var(--line-strong); border-radius: var(--r-sm);
  background: var(--raised); color: var(--accent); font: 500 var(--text-xs) var(--font-ui); font-variant-numeric: tabular-nums; cursor: pointer; white-space: nowrap;
}
.clip:hover, .clip:focus-visible { border-color: var(--accent); background: var(--accent-soft); }
.clip.on { border-color: var(--accent); background: var(--accent); color: var(--raised); }
.clip svg { fill: currentColor; }
@media (max-width: 720px) { .clip { min-height: 36px; padding: 0 8px; } }
</style>
