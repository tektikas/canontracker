<script setup lang="ts">
// A source document read as passages with line numbers. `active` highlights one passage; `quote` marks the cited words inside it.
// `contained`: the reader is its own scroll box (review split view) and keeps the active passage centred in it.
const props = defineProps<{ doc: { content: string, passages: Record<string, any>[] }, active?: string | null, quote?: string, contained?: boolean }>()

const lines = computed(() => props.doc.content.split('\n'))
const heading = (p: Record<string, any>) => /^#{1,6}\s/.test(lines.value[p.start_line - 1] ?? '')

// Verified quotes appear verbatim in their passage (the importer matched them with includes), so a plain split is exact.
function parts(p: Record<string, any>) {
  if (p.id !== props.active || !props.quote) return null
  const i = p.text.indexOf(props.quote)
  return i < 0 ? null : [p.text.slice(0, i), props.quote, p.text.slice(i + props.quote.length)]
}

const root = ref<HTMLElement>()
watch(() => [props.active, props.doc] as const, async () => {
  if (!props.contained) return
  await nextTick()
  const box = root.value
  const el = box?.querySelector<HTMLElement>('.passage.active')
  if (box) box.scrollTop = el ? el.offsetTop - (box.clientHeight - el.offsetHeight) / 2 : 0
}, { immediate: true, flush: 'post' })
</script>

<template>
  <div ref="root" class="reader" :class="{ contained }">
    <div
      v-for="p in doc.passages" :id="String(p.id)" :key="String(p.id)"
      class="passage" :class="{ active: active === p.id, heading: heading(p) }"
      :aria-current="active === p.id ? 'location' : undefined"
    >
      <span class="ln">{{ p.start_line }}<template v-if="p.end_line !== p.start_line">–{{ p.end_line }}</template></span>
      <span class="text">
        <template v-if="parts(p)">{{ parts(p)![0] }}<mark>{{ parts(p)![1] }}</mark>{{ parts(p)![2] }}</template>
        <template v-else>{{ p.text }}</template>
      </span>
    </div>
  </div>
</template>

<style scoped>
.reader { display: grid; gap: 2px; max-width: 72ch; }
.reader.contained { position: relative; overflow-y: auto; overscroll-behavior: contain; max-width: none; }
.passage { grid-template-columns: 44px 1fr; scroll-margin-top: 96px; }
.passage .ln { text-align: right; }
.passage .text { font-size: var(--text-md); }
.passage.heading .text { font-weight: 600; font-size: var(--text-lg); line-height: 1.4; }
.passage.heading { padding-top: var(--s-3); }
mark { background: color-mix(in srgb, var(--accent) 22%, transparent); color: inherit; border-radius: 2px; padding: 0 1px; }
@media (max-width: 720px) {
  .passage { grid-template-columns: 30px 1fr; gap: var(--s-2); padding: 6px 8px; }
}
</style>
