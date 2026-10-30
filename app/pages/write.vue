<script setup lang="ts">
// Write a document in the app. The text autosaves as a private draft; "Save to story" turns it into a read-only document
// version (hashed, split into passages) exactly like an import. ?doc=<id> edits a written document (the save is a new
// version), ?draft=<id> resumes a draft.
useHead({ title: 'Write · Story Bible' })
const route = useRoute()
const router = useRouter()
const editor = computed(() => canEdit(useMe().value))
const KINDS = [['scene', 'Scene'], ['lore', 'Lore'], ['character', 'Character'], ['other', 'Other']] as const

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

// Autosave: one request at a time; changes made while it runs are saved right after.
let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null
let dirty = false
async function persist() {
  clearTimeout(timer)
  if (running) {
    await running
    if (!dirty) return
  }
  if (!dirty) return
  dirty = false
  status.value = 'saving'
  let failed = false
  running = (async () => {
    try {
      const fields = { title: f.title, kind: f.kind, content: f.content }
      if (draftId.value) {
        savedAt.value = (await $fetch(`/api/drafts/${draftId.value}`, { method: 'PUT', body: fields })).updated_at
      } else {
        const d = await $fetch('/api/drafts', { method: 'POST', body: fields })
        draftId.value = d.id
        savedAt.value = d.updated_at
        router.replace({ query: { draft: d.id } })
      }
      status.value = dirty ? 'saving' : 'saved'
      saveError.value = ''
    } catch (e) {
      dirty = true
      failed = true
      status.value = 'error'
      saveError.value = errorMessage(e)
    }
  })()
  await running
  running = null
  if (dirty && !failed) await persist()
}
watch(f, () => {
  if (loading.value) return
  dirty = true
  status.value = 'saving'
  clearTimeout(timer)
  timer = setTimeout(persist, 700)
})
onBeforeRouteLeave(async () => { if (dirty) await persist() })
onBeforeUnmount(() => clearTimeout(timer))
function unload(e: BeforeUnloadEvent) { if (dirty || running) e.preventDefault() }
onMounted(() => window.addEventListener('beforeunload', unload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', unload))

const saving = ref(false)
const error = ref('')
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
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}
async function discard() {
  if (!confirm(editing.value ? 'Discard your changes? The saved document stays as it is.' : 'Discard this draft? It can’t be recovered.')) return
  clearTimeout(timer)
  dirty = false
  if (draftId.value) await $fetch(`/api/drafts/${draftId.value}`, { method: 'DELETE' }).catch(() => {})
  await navigateTo(editing.value ? `/documents/${editing.value.id}` : '/#sources', { replace: true })
}
function keys(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    dirty = true
    persist()
  }
}

// The text area grows with the text, so the page scrolls instead of a box inside it.
const body = ref<HTMLTextAreaElement>()
function grow() {
  const el = body.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}
watch(() => f.content, () => nextTick(grow), { flush: 'post' })
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <UiPanel v-if="!editor">
    <UiEmptyState title="View only" icon="lock">
      Editors, admins and owners write documents. Ask a studio owner or admin for editor access.
      <template #actions><UiButton to="/#sources">Back to sources</UiButton></template>
    </UiEmptyState>
  </UiPanel>
  <UiPanel v-else-if="loadError">
    <UiEmptyState title="This draft isn’t here anymore" icon="file">
      {{ loadError }}
      <template #actions><UiButton to="/write">Start a new document</UiButton></template>
    </UiEmptyState>
  </UiPanel>
  <div v-else class="write" @keydown="keys">
    <nav class="crumbs small" aria-label="Breadcrumb">
      <NuxtLink to="/#sources">Sources</NuxtLink><span aria-hidden="true">/</span>
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
        :placeholder="loading ? 'Opening…' : 'Write or paste a scene. A blank line starts a new passage.'" @input="grow"
      />
    </UiPanel>
    <p class="small faint syntax">A blank line starts a new passage; facts and notes are pinned to passages by line. Start a line with # for a heading.</p>

    <p v-if="error" class="notice bad" role="alert">{{ error }}</p>

    <footer class="bar">
      <span class="small muted bar-status" role="status">
        <b>{{ words.toLocaleString('en') }}</b> {{ words === 1 ? 'word' : 'words' }}
        <span aria-hidden="true">·</span>
        <template v-if="status === 'saving'">Saving draft…</template>
        <span v-else-if="status === 'error'" class="bad">Draft not saved: {{ saveError }}</span>
        <template v-else-if="status === 'saved'">Draft saved {{ time(savedAt) }}</template>
        <template v-else>Drafts save as you type. Only you see them.</template>
      </span>
      <div class="row">
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
  position: sticky; bottom: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; justify-content: space-between;
  padding: var(--s-3) 0; background: var(--canvas); border-top: 1px solid var(--line);
}
.bar-status { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.bar-status b { color: var(--ink); font-variant-numeric: tabular-nums; }
.bar-status .bad { color: var(--bad); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 720px) {
  .sheet { padding: var(--s-4); }
  .title-input.title-input { font-size: var(--text-xl); }
  .bar .row { width: 100%; }
  .bar .row .btn { flex: 1 1 auto; }
}
</style>
