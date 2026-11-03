<script setup lang="ts">
import type { SelectionMode, TextSelection } from './SelectionDialog.vue'

// A source document read as passages with line numbers. `active` highlights one passage; `quote` marks the cited words inside it.
// `contained`: the reader is its own scroll box (review split view) and keeps the active passage centred in it.
// `annotate`: selecting words offers "Add fact", "Add entity" and "Add note" (keys F, E and N). `research`: it offers "Research this"
// (key R), which opens the chat in Research mode with the selection quoted, and "Check continuity" (key C), which checks the
// selection against canon in the chat (Canon mode). `notes` puts a marker beside passages that have one.
const props = defineProps<{
  doc: { id?: string, title?: string, content: string, passages: Record<string, any>[] }
  active?: string | null, quote?: string, contained?: boolean, annotate?: boolean, research?: boolean
  notes?: { id: string, anchor: string | null, status: string }[]
}>()
const emit = defineEmits<{ saved: [kind: 'fact' | 'note', result: Record<string, any>], notes: [passageId: string] }>()

// Line gutter grows with the longest label ("1204–1206" must not run into the text).
const gutter = computed(() => (timed.value ? '10ch' : `${Math.max(3, ...props.doc.passages.map(p => String(p.start_line).length + (p.end_line !== p.start_line ? String(p.end_line).length + 1 : 0))) + 1}ch`))
// A recording's transcript: each passage is one transcribed turn and plays from its start time instead of showing a line number.
const timed = computed(() => props.doc.passages.some(p => p.start_ms != null))
const lines = computed(() => props.doc.content.split('\n'))
const heading = (p: Record<string, any>) => /^#{1,6}\s/.test(lines.value[p.start_line - 1] ?? '')

// Verified quotes are stored as the passage's exact characters, so a plain indexOf finds the cited words.
function marked(p: Record<string, any>): [number, number] | null {
  if (p.id !== props.active || !props.quote) return null
  const i = p.text.indexOf(props.quote)
  return i < 0 ? null : [i, i + props.quote.length]
}
const notesAt = (id: string) => props.notes?.filter(n => n.anchor === id) ?? []
// One margin mark per passage, shaped by its most pressing note: open (note), ready (check), only done ones (filled check).
const MARK = {
  open: { icon: 'note', label: 'open' }, ready: { icon: 'check', label: 'ready' }, done: { icon: 'checked', label: 'done' },
} as const
const markOf = (id: string) => {
  const ns = notesAt(id)
  if (!ns.length) return null
  const status = (['open', 'ready', 'done'] as const).find(s => ns.some(n => n.status === s))!
  const n = ns.filter(x => x.status === status).length
  return { status, n, ...MARK[status], aria: `${n} ${MARK[status].label} ${n === 1 ? 'note' : 'notes'} on this passage${ns.length > n ? `, ${ns.length} in all` : ''}` }
}

const root = ref<HTMLElement>()
watch(() => [props.active, props.doc] as const, async () => {
  if (!props.contained) return
  await nextTick()
  const box = root.value
  const el = box?.querySelector<HTMLElement>('.passage.active')
  if (box) box.scrollTop = el ? el.offsetTop - (box.clientHeight - el.offsetHeight) / 2 : 0
}, { immediate: true, flush: 'post' })

// Selection → a small toolbar under it. The quote is the selected text as the passage holds it (white-space: pre-wrap keeps
// line breaks), trimmed at the ends; the server checks it again before storing anything.
const sel = ref<(TextSelection & { top: number, left: number }) | { multi: true, top: number, left: number } | null>(null)
const open = ref<{ selection: TextSelection, mode: SelectionMode } | null>(null)
const textOf = (n: Node | null) => (n?.nodeType === 1 ? n as Element : n?.parentElement)?.closest('.passage .text')
let timer: ReturnType<typeof setTimeout> | undefined
function readSelection() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const s = getSelection()
    if (!(props.annotate || props.research) || !s || s.isCollapsed || !s.rangeCount || !root.value || open.value) return (sel.value = null)
    const range = s.getRangeAt(0)
    const [a, b] = [textOf(range.startContainer), textOf(range.endContainer)]
    if (!a || !b || !root.value.contains(a) || !root.value.contains(b)) return (sel.value = null)
    const r = range.getBoundingClientRect()
    const pos = { top: Math.min(r.bottom + 8, innerHeight - 56), left: Math.min(Math.max(r.left + r.width / 2, 120), innerWidth - 120) }
    if (a !== b) return (sel.value = { multi: true, ...pos })
    const passage = props.doc.passages.find(p => p.id === a.closest('.passage')!.id)
    const quote = s.toString().trim()
    sel.value = passage && quote && props.doc.id
      ? { doc: { id: props.doc.id, title: props.doc.title ?? '' }, passage: { id: passage.id, start_line: passage.start_line, end_line: passage.end_line }, quote, ...pos }
      : null
  }, 120)
}
function start(mode: SelectionMode) {
  const s = sel.value
  if (!s || 'multi' in s) return
  open.value = { selection: { doc: s.doc, passage: s.passage, quote: s.quote }, mode }
  sel.value = null
}
function startChat(mode: 'research' | 'canon') {
  const s = sel.value
  if (!s || 'multi' in s) return
  const lines = `line ${s.passage.start_line}${s.passage.end_line !== s.passage.start_line ? `–${s.passage.end_line}` : ''}`
  openChat({ fresh: true, mode, check: mode === 'canon', quote: { type: 'passage', id: s.passage.id, label: `${s.doc.title}, ${lines}`, quote: s.quote } })
  sel.value = null
}
function onKey(e: KeyboardEvent) {
  if (!sel.value || 'multi' in sel.value || open.value || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
  if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return
  if (props.research && (e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'c')) {
    e.preventDefault()
    return startChat(e.key.toLowerCase() === 'r' ? 'research' : 'canon')
  }
  const mode = props.annotate && ({ f: 'fact', e: 'entity', n: 'note' } as const)[e.key.toLowerCase() as 'f' | 'e' | 'n']
  if (!mode) return
  e.preventDefault()
  start(mode)
}
function saved(kind: 'fact' | 'note', result: Record<string, any>) {
  open.value = null
  getSelection()?.removeAllRanges()
  emit('saved', kind, result)
}
onMounted(() => {
  if (!props.annotate && !props.research) return
  document.addEventListener('selectionchange', readSelection)
  window.addEventListener('scroll', readSelection, true)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  document.removeEventListener('selectionchange', readSelection)
  window.removeEventListener('scroll', readSelection, true)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="reader" :class="{ contained }" :style="{ '--gutter': gutter }">
    <div
      v-for="p in doc.passages" :id="String(p.id)" :key="String(p.id)"
      class="passage" :class="{ active: active === p.id, heading: heading(p) }"
      :aria-current="active === p.id ? 'location' : undefined"
    >
      <span class="ln">
        <template v-if="p.start_ms != null && doc.id">
          <ClipButton :doc-id="doc.id" :start="p.start_ms" :end="p.end_ms" />
          <span v-if="p.speaker" class="speaker" :title="`Speaker ${p.speaker}`">{{ p.speaker }}</span>
        </template>
        <template v-else>{{ p.start_line }}<template v-if="p.end_line !== p.start_line">–{{ p.end_line }}</template></template>
        <button v-if="markOf(p.id)" type="button" class="note-mark" :class="markOf(p.id)!.status" :aria-label="markOf(p.id)!.aria" :title="markOf(p.id)!.aria" @click="emit('notes', p.id)">
          <UiIcon :name="markOf(p.id)!.icon" :size="14" /><span v-if="markOf(p.id)!.n > 1">{{ markOf(p.id)!.n }}</span>
        </button>
      </span>
      <span class="text">
        <StoryText :text="p.text" :mark="marked(p)" />
      </span>
    </div>

    <Teleport v-if="annotate || research" to="body">
    <div v-if="sel" class="sel-bar" role="toolbar" aria-label="Selected text" :style="{ top: `${sel.top}px`, left: `${sel.left}px` }" @pointerdown.prevent>
      <span v-if="'multi' in sel" class="sel-multi">Select words within one paragraph</span>
      <template v-else>
        <template v-if="annotate">
          <button type="button" class="sel-btn" @click="start('fact')"><UiIcon name="canon" :size="16" />Add fact <kbd>F</kbd></button>
          <button type="button" class="sel-btn" @click="start('entity')"><UiIcon name="entities" :size="16" />Add entity <kbd>E</kbd></button>
          <button type="button" class="sel-btn" @click="start('note')"><UiIcon name="note" :size="16" />Add note <kbd>N</kbd></button>
        </template>
        <button v-if="research" type="button" class="sel-btn research" @click="startChat('research')"><UiIcon name="research" :size="16" />Research this <kbd>R</kbd></button>
        <button v-if="research" type="button" class="sel-btn" title="Check the selected words against accepted canon" @click="startChat('canon')"><UiIcon name="conflicts" :size="16" />Check continuity <kbd>C</kbd></button>
      </template>
    </div>
    <SelectionDialog v-if="open" :selection="open.selection" :mode="open.mode" @close="open = null" @saved="saved" />
    </Teleport>
  </div>
</template>

<style scoped>
.reader { display: grid; gap: 2px; max-width: 72ch; }
.reader.contained { position: relative; overflow-y: auto; overscroll-behavior: contain; max-width: none; }
.passage { grid-template-columns: max(44px, var(--gutter)) 1fr; scroll-margin-top: 96px; }
.passage .ln { display: grid; justify-items: end; align-content: start; gap: 4px; text-align: right; }
.passage .text { font-size: var(--text-md); }
.passage.heading .text { font-weight: 600; font-size: var(--text-lg); line-height: 1.4; }
.passage.heading { padding-top: var(--s-3); }
.speaker { font: 600 var(--text-xs) var(--font-ui); color: var(--muted); }
.note-mark {
  display: inline-flex; align-items: center; gap: 2px; min-width: 26px; height: 24px; padding: 0 4px; justify-content: center;
  border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent); border-radius: var(--r-sm); background: var(--warn-soft); color: var(--warn);
  font: 600 11px/1 var(--font-ui); cursor: pointer;
}
.note-mark:hover { border-color: currentColor; }
.note-mark.ready { border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: var(--accent-soft); color: var(--accent); }
.note-mark.done { border-color: var(--line); background: none; color: var(--faint); }
.sel-bar {
  position: fixed; z-index: 60; transform: translateX(-50%); display: flex; gap: 2px; padding: 3px;
  background: var(--raised); border: 1px solid var(--line-strong); border-radius: var(--r-md); box-shadow: var(--elev-overlay);
}
.sel-btn {
  display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 10px; border: 0; border-radius: var(--r-sm);
  background: none; color: var(--ink); font: 500 var(--text-sm) var(--font-ui); cursor: pointer; white-space: nowrap;
}
.sel-btn:hover, .sel-btn:focus-visible { background: var(--accent-soft); color: var(--accent); }
.sel-btn svg { color: var(--accent); }
.sel-btn.research svg { color: var(--research); }
.sel-btn.research:hover, .sel-btn.research:focus-visible { background: var(--research-soft); color: var(--research); }
.sel-multi { padding: 6px 10px; font-size: var(--text-sm); color: var(--muted); white-space: nowrap; }
@media (max-width: 720px) {
  /* Five actions wrap to two rows: centre the bar on the screen so it never runs off the edge. */
  .sel-bar { flex-wrap: wrap; justify-content: center; width: max-content; max-width: calc(100vw - 16px); left: 50% !important; }
  .passage { grid-template-columns: max(30px, var(--gutter)) 1fr; gap: var(--s-2); padding: 6px 8px; }
  .sel-btn { min-height: 40px; }
}
</style>
