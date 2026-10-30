<script setup lang="ts">
// One note pinned to a passage. Open → ready → done, with one primary action for the next step.
// `source`: show which document and line it is pinned to (lists outside the reader).
const props = defineProps<{ note: Record<string, any>, source?: boolean }>()
const emit = defineEmits<{ changed: [note: Record<string, any>] }>()
const editor = computed(() => canEdit(useMe().value))

const STATUS: Record<string, { label: string, tone: 'warn' | 'accent' | 'neutral' }> = {
  open: { label: 'Open', tone: 'warn' }, ready: { label: 'Ready', tone: 'accent' }, done: { label: 'Done', tone: 'neutral' },
}
const NEXT: Record<string, { to: string, label: string }> = { open: { to: 'ready', label: 'Mark ready' }, ready: { to: 'done', label: 'Mark done' }, done: { to: 'open', label: 'Reopen' } }
const busy = ref(false)
const error = ref('')
async function move(status: string) {
  busy.value = true
  error.value = ''
  try {
    emit('changed', await $fetch(`/api/notes/${props.note.id}`, { method: 'PATCH', body: { status } }))
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const line = computed(() => `line ${props.note.start_line}${props.note.end_line !== props.note.start_line ? `–${props.note.end_line}` : ''}`)
</script>

<template>
  <article :id="`note-${note.id}`" class="note" :class="note.status" tabindex="-1">
    <div class="note-top">
      <UiBadge :tone="STATUS[note.status]?.tone" :dot="note.status !== 'done'">{{ STATUS[note.status]?.label }}</UiBadge>
      <span class="small faint">{{ note.created_by_name }} · {{ when(note.created_at) }}</span>
    </div>
    <blockquote v-if="note.quote" class="note-quote">{{ note.quote }}</blockquote>
    <p class="note-body">{{ note.body }}</p>
    <NuxtLink v-if="source" :to="`/documents/${note.document_id}#${note.passage_id}`" class="small note-src">
      <UiIcon name="file" :size="14" />{{ note.document_title }} <span class="faint">v{{ note.document_version }}, {{ line }}</span>
    </NuxtLink>
    <p v-if="note.anchor_issue === 'ambiguous'" class="small warn-text">Needs re-anchoring: pinned to v{{ note.document_version }}, {{ line }}, and those words now appear in more than one place.</p>
    <p v-else-if="note.anchor === null" class="small faint">Pinned to v{{ note.document_version }}; the words it was pinned to are no longer in this version.</p>
    <div v-if="editor" class="row note-actions">
      <UiButton size="sm" :variant="note.status === 'done' ? 'ghost' : 'primary'" :loading="busy" @click="move(NEXT[note.status]!.to)">{{ NEXT[note.status]!.label }}</UiButton>
      <UiButton v-if="note.status === 'ready'" size="sm" variant="ghost" :disabled="busy" @click="move('open')">Reopen</UiButton>
    </div>
    <p v-if="error" class="small field-error" role="alert">{{ error }}</p>
  </article>
</template>

<style scoped>
.note { display: grid; gap: 6px; padding: var(--s-3); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); outline: none; }
.note.open { box-shadow: inset 3px 0 0 var(--warn); }
.note.ready { box-shadow: inset 3px 0 0 var(--accent); }
.note.done { background: var(--surface); }
.note.done .note-body { color: var(--muted); }
.note:focus-visible, .note.flash { border-color: var(--accent); }
.note-top { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; justify-content: space-between; }
.note-quote { margin: 0; padding-left: 10px; border-left: 2px solid var(--line-strong); font-family: var(--font-story); font-style: italic; font-size: var(--text-sm); color: var(--muted); white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.note-body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.note-src { display: inline-flex; align-items: center; gap: 6px; color: var(--ink); text-decoration: none; }
.note-src:hover { color: var(--accent); }
.note-actions { margin-top: 2px; }
.warn-text { margin: 0; color: var(--warn); }
</style>
