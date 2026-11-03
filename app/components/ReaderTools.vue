<script setup lang="ts">
// Tools for a long source in the reader: find in the text (/ or Ctrl+F; Enter / Shift+Enter step through), an outline from
// its headings, and jump to a line. Matches are painted with the CSS Custom Highlight API, so the text and its mention
// links are never re-rendered or changed. `target` is the element that holds the PassageReader.
const props = defineProps<{ content: string, passages: { id: string, start_line: number, end_line: number, text: string }[], target?: HTMLElement | null }>()
const router = useRouter()

// Outline: passages that start on a Markdown heading line.
const lines = computed(() => props.content.split('\n'))
const outline = computed(() => props.passages.flatMap((p) => {
  const m = /^(#{1,6})\s+/.exec(lines.value[p.start_line - 1] ?? '')
  return m ? [{ id: p.id, level: m[1]!.length, text: p.text }] : []
}))
const minLevel = computed(() => Math.min(...outline.value.map(o => o.level)))
async function goTo(id: string) {
  await router.replace({ hash: `#${id}` })
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
}

// Jump to a line: the passage that holds it, or the next one when the line is blank.
const lineNo = ref<number | null>(null)
const lineError = ref('')
function jump() {
  const n = Number(lineNo.value)
  const last = lines.value.length
  if (!Number.isInteger(n) || n < 1 || n > last) return (lineError.value = `Lines run 1–${last}.`)
  lineError.value = ''
  const p = props.passages.find(x => n <= x.end_line) ?? props.passages.at(-1)
  if (p) goTo(p.id)
}

// Find.
const finding = ref(false)
const query = ref('')
const input = ref<HTMLInputElement>()
const matches = shallowRef<Range[]>([])
const index = ref(0)
const canHighlight = () => typeof CSS !== 'undefined' && 'highlights' in CSS
function paint() {
  if (!canHighlight()) return
  if (!matches.value.length) {
    CSS.highlights.delete('sb-find')
    CSS.highlights.delete('sb-find-current')
    return
  }
  CSS.highlights.set('sb-find', new Highlight(...matches.value))
  CSS.highlights.set('sb-find-current', new Highlight(matches.value[index.value]!))
}
function search() {
  const root = props.target
  const needle = query.value.trim().toLowerCase()
  const found: Range[] = []
  if (root && needle) {
    for (const el of root.querySelectorAll<HTMLElement>('.passage .text')) {
      const nodes: Text[] = []
      const starts: number[] = []
      let text = ''
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const n = walker.currentNode as Text
        starts.push(text.length)
        nodes.push(n)
        text += n.data
      }
      // A match can span text nodes (a mention link splits the passage): map both ends back to their own node.
      const at = (off: number, end: boolean) => {
        const k = nodes.findIndex((n, i) => (end ? off > starts[i]! && off <= starts[i]! + n.length : off >= starts[i]! && off < starts[i]! + n.length))
        return [nodes[k]!, off - starts[k]!] as const
      }
      const hay = text.toLowerCase()
      for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) {
        const r = document.createRange()
        r.setStart(...at(i, false))
        r.setEnd(...at(i + needle.length, true))
        found.push(r)
      }
    }
  }
  matches.value = found
  index.value = 0
  paint()
  reveal()
}
function reveal() {
  const r = matches.value[index.value]
  if (!r) return
  const el = (r.startContainer.parentElement)?.closest('.passage')
  el?.scrollIntoView({ block: 'center' })
}
function step(d: 1 | -1) {
  const n = matches.value.length
  if (!n) return
  index.value = (index.value + d + n) % n
  paint()
  reveal()
}
let t: ReturnType<typeof setTimeout> | undefined
watch(query, () => {
  clearTimeout(t)
  t = setTimeout(search, 120)
})
watch(() => props.content, () => nextTick(search))
async function openFind() {
  finding.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}
function closeFind() {
  finding.value = false
  query.value = ''
  matches.value = []
  paint()
}
function onKey(e: KeyboardEvent) {
  const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')
  if (pressed(e, 'reader.findMod') || (pressed(e, 'reader.find') && !typing)) {
    e.preventDefault()
    openFind()
  }
}
function onFindKey(e: KeyboardEvent) {
  if (pressed(e, 'reader.findNext') || pressed(e, 'reader.findPrev')) {
    e.preventDefault()
    step(pressed(e, 'reader.findPrev') ? -1 : 1)
  } else if (pressed(e, 'reader.findClose')) {
    e.preventDefault()
    closeFind()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(t)
  matches.value = []
  paint()
})
</script>

<template>
  <div class="tools">
    <div v-if="finding" class="find" role="search">
      <UiIcon name="search" :size="16" />
      <input ref="input" v-model="query" type="search" placeholder="Find in this document" aria-label="Find in this document" @keydown="onFindKey">
      <span class="count small" role="status">{{ query.trim() ? (matches.length ? `${index + 1} of ${matches.length}` : 'No matches') : '' }}</span>
      <button type="button" class="icon-btn sm" aria-label="Previous match" title="Previous (Shift+Enter)" :disabled="!matches.length" @click="step(-1)"><UiIcon name="up" :size="16" /></button>
      <button type="button" class="icon-btn sm" aria-label="Next match" title="Next (Enter)" :disabled="!matches.length" @click="step(1)"><UiIcon name="down" :size="16" /></button>
      <button type="button" class="icon-btn sm" aria-label="Close find" title="Close (Esc)" @click="closeFind"><UiIcon name="close" :size="16" /></button>
    </div>
    <div v-else class="bar">
      <UiButton size="sm" variant="ghost" icon="search" @click="openFind">Find<kbd>{{ keyLabel('reader.find') }}</kbd></UiButton>
      <UiMenu v-if="outline.length > 1" label="Outline" class="outline">
        <template #trigger><UiIcon name="outline" :size="16" />Outline</template>
        <template #default="{ close }">
          <button v-for="o in outline" :key="o.id" type="button" class="menu-item" :style="{ paddingLeft: `${10 + (o.level - minLevel) * 14}px` }" @click="close(); goTo(o.id)">{{ o.text }}</button>
        </template>
      </UiMenu>
      <form class="line" @submit.prevent="jump">
        <label for="jump-line" class="small">Line</label>
        <input id="jump-line" v-model.number="lineNo" type="number" min="1" :max="lines.length" inputmode="numeric" :aria-describedby="lineError ? 'jump-error' : undefined">
        <UiButton size="sm" type="submit">Go</UiButton>
        <span v-if="lineError" id="jump-error" class="field-error" role="alert">{{ lineError }}</span>
      </form>
    </div>
  </div>
</template>

<style scoped>
.tools { position: sticky; top: 0; z-index: 5; margin: calc(-1 * var(--s-5)) calc(-1 * var(--s-4)) var(--s-3); padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--line); border-radius: var(--r-lg) var(--r-lg) 0 0; background: var(--raised); }
.bar, .find { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); }
.find svg { color: var(--faint); }
.find { flex-wrap: nowrap; }
.find input { flex: 1 1 100px; min-width: 0; width: auto; min-height: 32px; padding: 4px 8px; }
.count { min-width: 52px; white-space: nowrap; color: var(--muted); font-variant-numeric: tabular-nums; }
.icon-btn.sm { width: 32px; height: 32px; color: var(--muted); }
.icon-btn:disabled { color: var(--faint); cursor: default; background: none; }
.outline :deep(.menu-trigger) { gap: 6px; min-height: 28px; padding: 3px 10px; color: var(--muted); font-size: var(--text-sm); font-weight: 500; }
.outline :deep(.menu-pop) { min-width: 260px; max-width: min(360px, 80vw); }
.outline :deep(.menu-item) { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.line { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.line label { color: var(--muted); }
.line input { width: 72px; min-height: 28px; padding: 2px 6px; }
.line .field-error { flex-basis: 100%; text-align: right; }
@media (max-width: 900px) { .tools { top: 52px; } }
@media (max-width: 720px) {
  .tools { margin: calc(-1 * var(--s-3)) calc(-1 * var(--s-2)) var(--s-3); }
  .outline :deep(.menu-trigger), .line input { min-height: 44px; }
}
</style>
