<script setup lang="ts">
// Every note in the project, pinned to the text it is about. Notes are for the team; they never become canon.
useHead({ title: 'Notes · Story Bible' })
const route = useRoute()
const router = useRouter()
const { data: notes, refresh } = await useFetch('/api/notes', { default: () => [] })

type Status = 'open' | 'ready' | 'done' | 'all'
const STATUSES: Status[] = ['open', 'ready', 'done', 'all']
const status = computed<Status>({
  get: () => (STATUSES.includes(route.query.status as Status) ? route.query.status as Status : 'open'),
  set: v => router.replace({ query: { ...route.query, status: v === 'open' ? undefined : v } }),
})
const doc = computed({
  get: () => (typeof route.query.doc === 'string' ? route.query.doc : ''),
  set: v => router.replace({ query: { ...route.query, doc: v || undefined } }),
})
// One entry per document (all versions together), titled by its newest version.
const docs = computed(() => [...new Map(notes.value.map(n => [n.filename, n.document_title])).entries()])
const inDoc = computed(() => notes.value.filter(n => !doc.value || n.filename === doc.value))
const count = (s: Status) => (s === 'all' ? inDoc.value.length : inDoc.value.filter(n => n.status === s).length)
const tabs = computed(() => [
  { value: 'open' as Status, label: 'Open', count: count('open') },
  { value: 'ready' as Status, label: 'Ready', count: count('ready') },
  { value: 'done' as Status, label: 'Done', count: count('done') },
  { value: 'all' as Status, label: 'All', count: count('all') },
])
const shown = computed(() => inDoc.value.filter(n => status.value === 'all' || n.status === status.value))
const EMPTY: Record<Status, string> = {
  open: 'Nothing open. New notes start here.',
  ready: 'Nothing is ready yet. Mark an open note ready when it is handled and waiting for a check.',
  done: 'Nothing done yet.',
  all: 'No notes in this view.',
}
async function changed() {
  await refresh()
  refreshNuxtData('stats')
}
</script>

<template>
  <UiPageHeader title="Notes">
    Questions, fixes and references pinned to the text. Notes are for your team; they never become canon.
  </UiPageHeader>

  <UiPanel v-if="!notes.length">
    <UiEmptyState title="No notes yet" icon="note">
      Open a source, select the words a note is about and choose Add note.
      <template #actions><UiButton to="/library" icon="library">Open the library</UiButton></template>
    </UiEmptyState>
  </UiPanel>

  <template v-else>
    <div class="filters">
      <UiTabs v-model="status" :items="tabs" />
      <label class="doc-filter">
        <span class="sr-only">Document</span>
        <select v-model="doc">
          <option value="">All documents</option>
          <option v-for="[filename, title] in docs" :key="filename" :value="filename">{{ title }}</option>
        </select>
      </label>
    </div>
    <p v-if="!shown.length" class="muted none">{{ EMPTY[status] }}</p>
    <ul v-else class="list">
      <li v-for="n in shown" :key="n.id"><NoteCard :note="n" source @changed="changed" /></li>
    </ul>
  </template>
</template>

<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: end; justify-content: space-between; margin-bottom: var(--s-4); border-bottom: 1px solid var(--line); }
.filters .tabs { margin-bottom: -1px; border-bottom: 0; }
.doc-filter { min-width: 220px; padding-bottom: var(--s-2); }
.none { margin: 0; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); max-width: 760px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 720px) {
  .doc-filter { min-width: 0; width: 100%; }
}
</style>
