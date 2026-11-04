<script setup lang="ts">
// A document version's background extraction (app/composables/extractions.ts): "Waiting", "The AI is reading · 0:35",
// "AI critic checking", "Done · 12 facts to review" or "Didn’t finish" with the reason and Try again (editors).
// Nothing when the version had no background run; a finished run is shown for an hour, a failed one until it is retried.
const props = defineProps<{ id: string }>()
const { byId, label, retry } = useExtractions()
const editor = computed(() => canEdit(useMe().value))
const e = computed(() => {
  const x = byId.value.get(props.id)
  return x?.status === 'done' && x.ended_at && Date.now() - Date.parse(x.ended_at) > 3_600_000 ? undefined : x
})
const busy = ref(false)
const error = ref('')
async function again() {
  busy.value = true
  error.value = ''
  try { await retry(props.id) } catch (err) { error.value = errorMessage(err) } finally { busy.value = false }
}
</script>

<template>
  <span v-if="e" class="xs" :class="e.status" role="status">
    <span class="dot" aria-hidden="true" />
    <NuxtLink v-if="e.status === 'done' && e.created" to="/review">{{ label(e) }}</NuxtLink>
    <span v-else>{{ label(e) }}</span>
    <template v-if="e.status === 'failed'">
      <span class="why">{{ e.error }}</span>
      <button v-if="editor" type="button" class="link-btn" :disabled="busy" @click="again">Try again</button>
      <span v-if="error" class="why">{{ error }}</span>
    </template>
  </span>
</template>

<style scoped>
.xs { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--s-2); color: var(--muted); font-size: var(--text-sm); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); align-self: center; flex: none; }
.reading .dot, .critic .dot { background: var(--accent); animation: pulse 1.2s var(--ease) infinite; }
.done .dot { background: var(--good); }
.failed { color: var(--bad); }
.failed .dot { background: var(--bad); }
.why { color: var(--muted); }
.link-btn { padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-weight: 500; text-decoration: underline; cursor: pointer; }
.link-btn:disabled { opacity: .6; cursor: progress; }
@keyframes pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .reading .dot, .critic .dot { animation: none; } }
</style>
