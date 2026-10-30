<script setup lang="ts">
// Write a document in the app. The text autosaves as a private draft; "Save to story" turns it into a read-only document
// version (hashed, split into passages) exactly like an import. ?doc=<id> edits a written document (the save is a new
// version), ?draft=<id> resumes a draft.
useHead({ title: 'Write · Story Bible' })
const route = useRoute()
const router = useRouter()
const editor = computed(() => canEdit(useMe().value))
const KINDS = [['scene', 'Scene'], ['lore', 'Lore'], ['character', 'Character'], ['location', 'Location'], ['quest', 'Quest'], ['dialogue', 'Dialogue'], ['other', 'Other']] as const

const f = reactive({ title: '', kind: 'scene', content: '' })
const draftId = ref<string | null>(null)
const editing = ref<{ id: string, title: string, version: number } | null>(null)
const loading = ref(true)
const loadError = ref('')
const status = ref<'' | 'saving' | 'saved' | 'error'>('')
const savedAt = ref('')
const saveError = ref('')
const words = computed(() => f.content.trim().split(/\s+/).filter(Boolean).length)

onMounted(async () => {
  if (!editor.value) return (loading.value = false)
  try {
    const q = route.query
    const d = typeof q.doc === 'string' ? await $fetch('/api/drafts', { method: 'POST', body: { document_id: q.doc } })
      : typeof q.draft === 'string' ? await $fetch(`/api/drafts/${q.draft}`) : null
    if (d) {
      Object.assign(f, { title: d.title, kind: d.kind, content: d.content })
      draftId.value = d.id
      savedAt.value = d.updated_at
      status.value = 'saved'
      if (q.draft !== d.id) router.replace({ query: { draft: d.id } })
      if (d.filename) editing.value = (await $fetch(`/api/drafts/${d.id}`)).document
    }
  } catch (e) {
    loadError.value = (e as { statusCode?: number }).statusCode === 404 && route.query.draft
      ? 'It was saved to the story or discarded.' : errorMessage(e)
  } finally {
    loading.value = false
  }
  await nextTick()
  body.value?.focus()
})

// Autosave is one drain: one request at a time, and changes made while it runs are saved right after. persist() returns
// that drain, which resolves only once nothing is in flight and nothing is unsaved, or rejects when a save fails.
let timer: ReturnType<typeof setTimeout> | undefined
let drain: Promise<void> | null = null
let dirty = false
async function saveOnce() {
  const fields = { title: f.title, kind: f.kind, content: f.content }
  if (draftId.value) {
    savedAt.value = (await $fetch(`/api/drafts/${draftId.value}`, { method: 'PUT', body: fields })).updated_at
  } else {
    const d = await $fetch('/api/drafts', { method: 'POST', body: fields })
    draftId.value = d.id
    savedAt.value = d.updated_at
    router.replace({ query: { draft: d.id } })
  }
}
function persist(): Promise<void> {
  clearTimeout(timer)
  if (drain) return drain
  if (!dirty) { status.value = 'saved'; saveError.value = ''; return Promise.resolve() } // nothing to drain: never store a finished promise
  let p!: Promise<void>
  p = drain = (async () => {
    try {
      while (dirty) {
        dirty = false
        clearTimeout(timer) // this save carries every change made so far
        status.value = 'saving'
        try {
          await saveOnce()
        } catch (e) {
          dirty = true
          status.value = 'error'
          saveError.value = errorMessage(e)
          // Try again on its own a little later; typing, Ctrl+S or Save retries at once (persist() clears this timer).
          timer = setTimeout(persistQuietly, 5000)
          throw e
        }
      }
      status.value = 'saved'
      saveError.value = ''
    } finally {
      if (drain === p) drain = null
    }
  })()
  return p
}
// Background saves (timer, Ctrl+S, leaving focus) show a failure in the status line instead of throwing.
const persistQuietly = () => persist().catch(() => {})
watch(f, () => {
  if (loading.value) return
  dirty = true
  status.value = 'saving'
  clearTimeout(timer)
  timer = setTimeout(persistQuietly, 700)
})
// Leaving waits for the whole drain; if the text still isn't stored, stay unless the writer chooses to lose it.
let leaving = false
onBeforeRouteLeave(async () => {
  if (leaving || (!dirty && !drain)) return
  try {
    await persist()
  } catch {
    return askConfirm({ title: 'Leave without your latest changes?', body: 'They couldn’t be saved, so they’re only on this screen.', confirm: 'Leave and lose them', cancel: 'Stay', danger: true })
  }
})
onBeforeUnmount(() => clearTimeout(timer))
function unload(e: BeforeUnloadEvent) {
  if (!dirty && !drain) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', unload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', unload))
const saving = ref(false)
const error = ref('')
// A failed "Save to story" stays next to the button until a draft save goes through again (or fails: the status line says so).
watch(status, (s) => { if (s === 'saved' || s === 'error') error.value = '' }) // an autosave failure shows in the status line instead
const canSave = computed(() => !!f.title.trim() && !!f.content.trim())
async function saveToStory() {
  if (!canSave.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    dirty = dirty || !draftId.value
    await persist()
    // Never save an older copy of the text than the one on screen.
    if (!draftId.value || dirty) throw new Error(saveError.value || 'The draft could not be saved.')
    const r = await $fetch(`/api/drafts/${draftId.value}/save`, { method: 'POST' })
    draftId.value = null
    await refreshNuxtData('stats')
    // Replace: Back from the saved document shouldn't land on a draft that no longer exists.
    await navigateTo(`/documents/${r.document_id}`, { replace: true })
  } catch (e) {
    // A failed draft save already shows in the status line beside the button; this is for the save to the story itself.
    if (status.value !== 'error') error.value = `Couldn’t save to the story. ${errorMessage(e)} Your text is kept here; try again in a moment.`
  } finally {
    saving.value = false
  }
}
async function discard() {
  const ok = await askConfirm(editing.value
    ? { title: 'Discard your changes?', body: 'The saved document stays as it is.', confirm: 'Discard changes', danger: true }
    : { title: 'Discard this draft?', body: 'It can’t be recovered.', confirm: 'Discard draft', danger: true })
  if (!ok) return
  clearTimeout(timer)
  dirty = false
  leaving = true
  if (draftId.value) await $fetch(`/api/drafts/${draftId.value}`, { method: 'DELETE' }).catch(() => {})
  await navigateTo(editing.value ? `/documents/${editing.value.id}` : '/library', { replace: true })
}
function keys(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    dirty = true
    persistQuietly()
  }
}

// Focus mode: only the text on screen. The same textarea stays mounted, so autosave and the caret carry over; the
// Fullscreen API hides the browser too where it exists, otherwise a fixed overlay covers the app shell.
const root = ref<HTMLElement>()
const focus = ref(false)
const typing = ref(false)
const typewriter = ref(false)
const sessionStart = ref(0)
const sessionWords = computed(() => words.value - sessionStart.value)
async function enterFocus() {
  if (focus.value || loading.value) return
  sessionStart.value = words.value
  typing.value = false
  focus.value = true
  await nextTick()
  grow()
  root.value?.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {})
  body.value?.focus()
  keepCaret()
}
function exitFocus() {
  if (!focus.value) return
  focus.value = false
  // Leaving focus is a natural pause: store the text now rather than after the autosave delay.
  if (dirty || drain) persistQuietly()
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  nextTick(() => {
    grow()
    body.value?.focus()
  })
}
// Esc in browser fullscreen is taken by the browser; follow it out.
function onFullscreen() { if (!document.fullscreenElement) exitFocus() }
function focusKeys(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f' && editor.value && !loadError.value) {
    e.preventDefault()
    return focus.value ? exitFocus() : enterFocus()
  }
  if (!focus.value) return
  if (e.key === 'Escape') return exitFocus()
  if (e.key === 'Tab') {
    // Keep focus inside: the text, then the few controls in the bar.
    const items = [...root.value!.querySelectorAll<HTMLElement>('textarea, .focus-bar button')]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length]
    e.preventDefault()
    next?.focus()
  }
}
function onType(e: KeyboardEvent) {
  if (focus.value && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== 'Tab' && e.key !== 'Escape') typing.value = true
}
let lastPointer = ''
function onPointer(e: MouseEvent) {
  // Chrome fires mousemove when the layout shifts under a still pointer; only real movement wakes the bar.
  const at = `${e.screenX},${e.screenY}`
  if (at !== lastPointer) typing.value = false
  lastPointer = at
}
// Caret position inside the textarea, from a hidden copy of its text up to the caret.
// ponytail: copies the text before the caret on each call; fine for scenes, a range-based measure if chapters get huge.
function caretTop(el: HTMLTextAreaElement) {
  const css = getComputedStyle(el)
  const m = document.createElement('div')
  for (const k of ['font', 'letterSpacing', 'wordSpacing', 'lineHeight', 'padding', 'border', 'boxSizing', 'tabSize', 'textIndent', 'width'] as const) m.style[k] = css[k]
  Object.assign(m.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' })
  m.textContent = el.value.slice(0, el.selectionEnd)
  const mark = m.appendChild(document.createElement('span'))
  mark.textContent = '\u200b'
  el.parentElement!.appendChild(m)
  const y = mark.offsetTop
  m.remove()
  return y
}
// Keep the line being typed in view (above an on-screen keyboard too), or near the middle in typewriter mode.
function keepCaret() {
  const box = root.value
  const el = body.value
  if (!focus.value || !box || !el || document.activeElement !== el) return
  const y = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop + caretTop(el)
  const h = box.clientHeight
  const line = parseFloat(getComputedStyle(el).lineHeight) || 32
  if (typewriter.value) box.scrollTop = y - h * 0.45
  else if (y < box.scrollTop + 80) box.scrollTop = y - 80
  else if (y + line > box.scrollTop + h - 48) box.scrollTop = y + line - h + 48
}
const caretSoon = () => nextTick(() => requestAnimationFrame(keepCaret))
watch(typewriter, (on) => {
  localStorage.setItem('storybible.typewriter', on ? '1' : '')
  caretSoon()
})
// The visible viewport shrinks when a phone keyboard opens; the overlay follows it so the caret line stays above it.
function onViewport() {
  const v = window.visualViewport
  if (!v) return
  document.documentElement.style.setProperty('--focus-h', `${v.height}px`)
  document.documentElement.style.setProperty('--focus-top', `${v.offsetTop}px`)
  caretSoon()
}
onMounted(() => {
  typewriter.value = localStorage.getItem('storybible.typewriter') === '1'
  window.addEventListener('keydown', focusKeys)
  document.addEventListener('fullscreenchange', onFullscreen)
  window.visualViewport?.addEventListener('resize', onViewport)
  window.visualViewport?.addEventListener('scroll', onViewport)
  onViewport()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', focusKeys)
  document.removeEventListener('fullscreenchange', onFullscreen)
  window.visualViewport?.removeEventListener('resize', onViewport)
  window.visualViewport?.removeEventListener('scroll', onViewport)
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
})

// The text area grows with the text, so the page scrolls instead of a box inside it.
const body = ref<HTMLTextAreaElement>()
function grow() {
  const el = body.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}
watch(() => f.content, () => nextTick(grow), { flush: 'post' })
const time = (iso: string) => clock(iso).slice(0, 5)
</script>

<template>
  <UiPanel v-if="!editor">
    <UiEmptyState title="View only" icon="lock">
      Editors, admins and owners write documents. Ask a studio owner or admin for editor access.
      <template #actions><UiButton to="/library">Back to the library</UiButton></template>
    </UiEmptyState>
  </UiPanel>
  <UiPanel v-else-if="loadError">
    <UiEmptyState title="This draft isn’t here anymore" icon="file">
      {{ loadError }}
      <template #actions><UiButton to="/write">Start a new document</UiButton></template>
    </UiEmptyState>
  </UiPanel>
  <div
    v-else ref="root" class="write" :class="{ focusing: focus, typing: focus && typing && status !== 'error' }"
    :role="focus ? 'dialog' : undefined" :aria-modal="focus || undefined" :aria-label="focus ? 'Focus mode' : undefined"
    @keydown="keys" @mousemove="onPointer"
  >
    <div v-if="focus" class="focus-bar small" role="toolbar" aria-label="Focus mode">
      <span class="focus-status" role="status">
        <b>{{ words.toLocaleString('en') }}</b> {{ words === 1 ? 'word' : 'words' }}
        <span aria-hidden="true">·</span>
        <span title="Words added since you entered focus mode">{{ sessionWords < 0 ? '−' : '+' }}{{ Math.abs(sessionWords).toLocaleString('en') }}<span class="hide-sm"> this session</span></span>
        <span aria-hidden="true">·</span>
        <span v-if="status === 'error'" class="bad" :title="saveError">Not saved<span class="hide-sm">; your text is kept here</span></span>
        <span v-else-if="status === 'saving'">Saving…</span>
        <span v-else-if="status === 'saved'">Saved</span>
        <span v-else>Not saved yet</span>
      </span>
      <span class="row">
        <button type="button" role="switch" class="btn ghost sm tw" :aria-checked="typewriter" title="Keep the line you’re typing near the middle" @click="typewriter = !typewriter">
          <span class="switch" aria-hidden="true" />Typewriter<span class="tw-state hide-sm" aria-hidden="true">{{ typewriter ? 'On' : 'Off' }}</span>
        </button>
        <button type="button" class="btn ghost sm" title="Exit focus mode (Esc)" @click="exitFocus">
          <UiIcon name="close" :size="14" />Exit<kbd class="hide-sm">Esc</kbd>
        </button>
      </span>
    </div>

    <nav class="crumbs small" aria-label="Breadcrumb">
      <NuxtLink to="/library">Library</NuxtLink><span aria-hidden="true">/</span>
      <template v-if="editing"><NuxtLink :to="`/documents/${editing.id}`">{{ editing.title }}</NuxtLink><span aria-hidden="true">/</span><span>Edit</span></template>
      <span v-else>New document</span>
    </nav>

    <p v-if="editing" class="notice info edit-note">
      <UiIcon name="file" :size="16" />
      <span>Editing v{{ editing.version }}. Saving makes v{{ editing.version + 1 }}; v{{ editing.version }} stays as it was, and canon citing it is flagged to re-check.</span>
    </p>

    <div class="head">
      <label class="title-field">
        <span class="sr-only">Title</span>
        <input v-model="f.title" type="text" class="title-input" maxlength="120" placeholder="Untitled" :disabled="loading">
      </label>
      <div class="kinds" role="radiogroup" aria-label="Kind">
        <label v-for="[k, label] in KINDS" :key="k" class="kind" :class="{ on: f.kind === k }">
          <input v-model="f.kind" type="radio" name="kind" :value="k" :disabled="loading">{{ label }}
        </label>
      </div>
    </div>

    <UiPanel class="sheet">
      <textarea
        ref="body" v-model="f.content" class="body-input" :disabled="loading" aria-label="Text"
        :placeholder="loading ? 'Opening…' : 'Write or paste a scene. A blank line starts a new passage.'"
        @input="grow(); caretSoon()" @keydown="onType" @keyup="caretSoon" @click="caretSoon"
      />
    </UiPanel>
    <p class="small faint syntax">A blank line starts a new passage; facts and notes are pinned to passages by line. Start a line with # for a heading.</p>

    <footer class="bar">
      <p v-if="error" class="notice bad save-error" role="alert">{{ error }}</p>
      <span class="small muted bar-status" role="status">
        <b>{{ words.toLocaleString('en') }}</b> {{ words === 1 ? 'word' : 'words' }}
        <span aria-hidden="true">·</span>
        <template v-if="status === 'saving'">Saving draft…</template>
        <span v-else-if="status === 'error'" class="bad">Couldn’t save the draft. {{ saveError }} Your text is kept here; we’ll retry.</span>
        <template v-else-if="status === 'saved'">Draft saved {{ time(savedAt) }}</template>
        <template v-else>Drafts save as you type. Only you see them.</template>
      </span>
      <div class="row">
        <UiButton variant="ghost" icon="focus" :disabled="loading" title="Only the text on screen (Ctrl+Shift+F)" @click="enterFocus">Focus</UiButton>
        <UiButton v-if="draftId" variant="ghost" :disabled="saving" @click="discard">{{ editing ? 'Discard changes' : 'Discard draft' }}</UiButton>
        <UiButton variant="primary" icon="check" :loading="saving" :disabled="!canSave || loading" :title="canSave ? undefined : 'Add a title and some text first'" @click="saveToStory">
          {{ editing ? `Save as v${editing.version + 1}` : 'Save to story' }}
        </UiButton>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.write { display: grid; gap: var(--s-4); max-width: 820px; }
.crumbs { display: flex; gap: var(--s-2); align-items: center; color: var(--muted); }
.crumbs a { color: var(--muted); }
.edit-note svg { flex: none; margin-top: 2px; }
.head { display: grid; gap: var(--s-3); }
.title-field { display: block; }
.title-input.title-input { border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: none; padding: 4px 0 8px; font-size: var(--text-2xl); font-weight: 600; color: var(--ink); }
.title-input.title-input:focus-visible { outline: none; border-bottom-color: var(--accent); }
.kinds { display: flex; flex-wrap: wrap; gap: 6px; }
.kind { display: inline-flex; align-items: center; min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--r-md); background: var(--raised); color: var(--muted); font-weight: 500; cursor: pointer; }
.kind input { position: absolute; opacity: 0; pointer-events: none; }
.kind.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.kind:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
.sheet { padding: var(--s-5) var(--s-6); }
.body-input.body-input {
  display: block; width: 100%; min-height: 50vh; padding: 0; border: 0; background: none; resize: none; overflow: hidden;
  font-family: var(--font-story); font-size: var(--text-md); line-height: 1.75; color: var(--ink);
}
.body-input.body-input:focus-visible { outline: none; }
.syntax { margin: calc(-1 * var(--s-2)) 0 0; }
.bar {
  position: sticky; bottom: var(--bottom-nav-h, 0px); z-index: 5; display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; justify-content: space-between;
  padding: var(--s-3) 0; background: var(--canvas); border-top: 1px solid var(--line);
}
.save-error { flex: 1 1 100%; margin: 0; }
.bar-status { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.bar-status b { color: var(--ink); font-variant-numeric: tabular-nums; }
.bar-status .bad { color: var(--bad); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
/* Focus mode: the text alone, centered at a book measure. */
.write.focusing {
  position: fixed; top: var(--focus-top, 0); left: 0; right: 0; z-index: 100; height: var(--focus-h, 100dvh);
  display: block; max-width: none; overflow-y: auto; overscroll-behavior: contain;
  padding: max(72px, 14vh) var(--s-5) 0; background: var(--canvas);
}
.write.focusing:fullscreen { top: 0; height: 100%; }
.write.focusing::backdrop { background: var(--canvas); }
.write.focusing > :not(.sheet, .focus-bar) { display: none; }
.focusing .sheet { border: 0; background: none; padding: 0 0 50vh; }
.focusing .body-input.body-input { max-width: 68ch; margin: 0 auto; font-size: var(--text-lg); line-height: 1.85; caret-color: var(--accent); }
.focus-bar {
  position: fixed; top: var(--focus-top, 0); left: 0; right: 0; z-index: 1; display: flex; gap: var(--s-3); align-items: center; justify-content: space-between;
  padding: var(--s-2) var(--s-4); background: var(--canvas); color: var(--muted);
  transition: opacity 600ms var(--ease);
}
.write.focusing:fullscreen .focus-bar { top: 0; }
/* Text scrolling up fades out under the bar instead of being cut mid-line. */
.focus-bar::after { content: ''; position: absolute; top: 100%; left: 0; right: 0; height: var(--s-5); background: linear-gradient(var(--canvas), transparent); pointer-events: none; }
.focus-bar .row { flex-wrap: nowrap; gap: var(--s-1); }
.focus-status { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; font-variant-numeric: tabular-nums; }
.focus-status b { color: var(--ink); }
.focus-status .bad { color: var(--bad); }
.switch { position: relative; flex: none; width: 26px; height: 16px; border-radius: 8px; background: var(--line-strong); transition: background var(--dur-2) var(--ease); }
.switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--raised); transition: transform var(--dur-2) var(--ease); }
.tw[aria-checked="true"] { color: var(--accent); }
.tw[aria-checked="true"] .switch { background: var(--accent); }
.tw[aria-checked="true"] .switch::after { transform: translateX(10px); }
.tw-state { min-width: 2.2em; text-align: left; font-variant-numeric: tabular-nums; color: var(--faint); }
.tw[aria-checked="true"] .tw-state { color: var(--accent); }
.focus-bar kbd { margin-left: 4px; padding: 0 4px; border: 1px solid var(--line); border-radius: var(--r-sm); font: inherit; font-size: var(--text-xs); color: var(--faint); }
.typing .focus-bar:not(:focus-within) { opacity: 0; }
.typing { cursor: none; }
@media (prefers-reduced-motion: reduce) { .focus-bar, .switch, .switch::after { transition: none; } }
@media (max-width: 720px) {
  .write.focusing { padding: 64px var(--s-4) 0; }
  .focusing .body-input.body-input { font-size: var(--text-md); }
  .focus-bar { padding: var(--s-1) var(--s-2) var(--s-1) var(--s-4); background: var(--raised); border-bottom: 1px solid var(--line); }
  .focus-bar::after { background: linear-gradient(var(--canvas), transparent); }

  .sheet { padding: var(--s-4); }
  .title-input.title-input { font-size: var(--text-xl); }
  .bar .row { width: 100%; }
  .bar .row .btn { flex: 1 1 auto; }
}
</style>
