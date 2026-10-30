<script setup lang="ts">
const route = useRoute()
const me = useMe()
const editor = computed(() => canEdit(me.value))
const { data: doc, error, refresh } = await useFetch(() => `/api/documents/${route.params.id}`)
// :target does not update on client-side navigation, so highlight from the route hash.
const active = computed(() => route.hash.slice(1))
const lineOf = (ev: Record<string, any>) => `Line ${ev.start_line}${ev.end_line !== ev.start_line ? `–${ev.end_line}` : ''}`
// Evidence from this document, any version. One that cites another version is shown as such, never as this text.
const here = (f: Record<string, any>) => f.evidence.filter((ev: any) => ev.document_filename === doc.value?.filename)
const activeQuote = computed(() => doc.value?.facts.flatMap(f => f.evidence).find(ev => ev.verified && ev.passage_id === active.value)?.quote)
const latest = computed(() => !doc.value || doc.value.latest.id === doc.value.id)
// Facts and notes are only added to the latest version: an older one is already superseded.
const annotate = computed(() => editor.value && latest.value)

type Side = 'facts' | 'notes'
const side = ref<Side>(route.query.notes ? 'notes' : 'facts')
const openNotes = computed(() => doc.value?.notes.filter(n => n.status !== 'done').length ?? 0)
const sideTabs = computed(() => [
  { value: 'facts' as Side, label: 'Facts', count: doc.value?.facts.length ?? 0 },
  { value: 'notes' as Side, label: 'Notes', count: openNotes.value },
])
const sortedNotes = computed(() => [...(doc.value?.notes ?? [])].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done')))

// The last thing added here, with a link to where it now shows up.
const added = ref<{ kind: 'fact' | 'note', text: string, to: 'canon' | 'review' | 'note', entity?: { id: string, name: string } }>()
const lookup = useEntityLookup()
async function onSaved(kind: 'fact' | 'note', r: Record<string, any>) {
  await Promise.all([refresh(), refreshNuxtData('stats'), kind === 'fact' ? refreshEntities() : null])
  const e = kind === 'fact' && r.to === 'canon' ? lookup.value.byName.get(normName(r.subject)) : undefined
  added.value = { kind, text: kind === 'fact' ? r.statement : r.body, to: kind === 'note' ? 'note' : r.to, entity: e && { id: e.id, name: e.name } }
  if (kind === 'note') side.value = 'notes'
}
async function showNotes(passageId: string) {
  side.value = 'notes'
  await nextTick()
  const el = document.querySelector<HTMLElement>(`.notes-list [data-anchor="${passageId}"] .note`)
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  el?.focus({ preventScroll: true })
}
const savedAt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// A generated cover is editorial: shown above the source, never written into it.
const generator = ref<{ open: () => void }>()
const undo = ref('')
async function undoRemove() {
  const id = undo.value
  undo.value = ''
  try {
    await $fetch(`/api/images/${id}/apply`, { method: 'POST' })
    await refresh()
  } catch (e) {
    coverError.value = errorMessage(e)
  }
}
const coverBusy = ref(false)
const coverError = ref('')
async function removeCover() {
  coverBusy.value = true
  coverError.value = ''
  try {
    const id = doc.value!.cover!.id
    await $fetch(`/api/images/${id}/apply`, { method: 'DELETE' })
    await refresh()
    undo.value = id
  } catch (e) {
    coverError.value = errorMessage(e)
  } finally {
    coverBusy.value = false
  }
}
// Re-extract: runs extraction again on the latest version. It only ever adds pending candidates.
const { data: stats } = useNuxtData<{ model: { mode: string } }>('stats')
const reextracting = ref(false)
const reextracted = ref<{ tone: 'info' | 'warn' | 'bad', text: string, review?: boolean }>()
async function reextract() {
  reextracting.value = true
  reextracted.value = undefined
  try {
    const r = await $fetch(`/api/documents/${doc.value!.id}/extract`, { method: 'POST' })
    const skipped = Object.entries(r.skipped_by_status).map(([s, n]) => `${n} ${s === 'canon' ? 'in canon' : s}`).join(', ')
    const skipLine = r.skipped ? ` ${counted(r.skipped, 'reading')} already in the project ${r.skipped === 1 ? 'was' : 'were'} skipped (${skipped}).` : ''
    if (r.mode === 'mock' && !r.recorded_covers)
      reextracted.value = { tone: 'warn', text: 'Recorded demo run: only the Broken Tide demo files have recorded model output, so nothing was proposed for this document. Select words in the text to add facts by hand, or turn on the live model.' }
    else if (r.created)
      reextracted.value = { tone: 'info', text: `${r.mode === 'mock' ? 'Recorded demo run' : r.model_label}: ${counted(r.created, 'new candidate')} sent to review from v${r.version}${r.unverified ? `, ${r.unverified} with a quote not found in the text` : ''}.${skipLine}`, review: true }
    else
      reextracted.value = { tone: 'info', text: `${r.mode === 'mock' ? 'Recorded demo run' : r.model_label}: nothing new in v${r.version}.${skipLine || ' The model proposed nothing.'}` }
    await Promise.all([refresh(), refreshNuxtData('stats')])
  } catch (e) {
    reextracted.value = { tone: 'bad', text: errorMessage(e) }
  } finally {
    reextracting.value = false
  }
}
const recordedNoOutput = computed(() => stats.value?.model.mode === 'mock')
const readerBox = ref<HTMLElement>()
const pickVersion = (id: string) => navigateTo(`/documents/${id}`)
const madeOn = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <UiPanel v-if="error">
    <UiEmptyState title="Document not found" icon="file">
      It may have been removed, or it belongs to another project.
      <template #actions><UiButton to="/library">Back to the library</UiButton></template>
    </UiEmptyState>
  </UiPanel>
  <template v-else-if="doc">
    <nav class="crumbs small" aria-label="Breadcrumb">
      <NuxtLink to="/library">Library</NuxtLink><span aria-hidden="true">/</span>
      <template v-if="doc.folder"><NuxtLink :to="`/library?folder=${doc.folder.id}`">{{ doc.folder.path }}</NuxtLink><span aria-hidden="true">/</span></template>
      <span :title="doc.name">{{ doc.title }}</span>
    </nav>
    <UiPageHeader :title="doc.title">
      <span class="meta">
        <UiBadge><UiIcon :name="docKind(doc.kind).icon" :size="12" />{{ docKind(doc.kind).label }}</UiBadge>
        <select v-if="doc.versions.length > 1" class="version-pick" aria-label="Version" :value="doc.id" @change="pickVersion(($event.target as HTMLSelectElement).value)">
          <option v-for="v in doc.versions" :key="v.id" :value="v.id">v{{ v.version }}{{ v.id === doc.latest.id ? ' · latest' : '' }} · {{ shortDate(v.imported_at) }}</option>
        </select>
        <UiBadge v-else>v{{ doc.version }}</UiBadge>
        <UiBadge v-for="t in doc.tags" :key="t.id" :tone="(t.color as TagTone)">{{ t.name }}</UiBadge>
        <UiBadge tone="good" :title="doc.origin === 'written' ? 'Each save is a new version; saved versions never change' : 'Story Bible never edits imported sources'">Read-only source</UiBadge>
        <span v-if="doc.origin === 'written'" class="small muted">Written in Story Bible<template v-if="doc.created_by_name"> by {{ doc.created_by_name }}</template>, {{ savedAt(doc.imported_at) }}</span>
        <span class="mono faint" :title="`sha256 ${doc.sha256}`">sha256 {{ String(doc.sha256).slice(0, 12) }}…</span>
      </span>
      <template #actions>
        <UiButton icon="history" :to="`/documents/${doc.id}/history`">History<template v-if="doc.versions.length > 1"> · {{ doc.versions.length }}</template></UiButton>
        <template v-if="editor">
          <UiButton v-if="latest" icon="refresh" :loading="reextracting" :title="recordedNoOutput ? 'Recorded demo run: only the demo files have recorded output' : 'Run extraction again; new candidates go to review'" @click="reextract">Re-extract</UiButton>
          <UiButton v-if="doc.origin === 'written'" icon="review" :to="`/write?doc=${doc.latest.id}`">Edit</UiButton>
          <UiButton v-if="!doc.cover" icon="image" @click="generator?.open()">Generate cover</UiButton>
        </template>
      </template>
    </UiPageHeader>
    <ImageGenerator v-if="canEdit(me)" :id="doc.id" ref="generator" type="document" @changed="refresh" />
    <UndoToast v-if="undo" message="Cover removed." @undo="undoRemove" @close="undo = ''" />

    <figure v-if="doc.cover" class="cover panel">
      <img :src="doc.cover.url" :alt="`Cover for ${doc.title}`">
      <figcaption>
        <details class="small">
          <summary class="expand"><UiBadge tone="pencil">Generated with Muse Image</UiBadge> Cover by {{ doc.cover.created_by_name ?? 'unknown' }}, {{ madeOn(doc.cover.created_at) }}</summary>
          <p class="prompt">{{ doc.cover.prompt }}</p>
        </details>
        <div v-if="canEdit(me)" class="row">
          <UiButton size="sm" icon="image" @click="generator?.open()">Change</UiButton>
          <UiButton size="sm" variant="ghost" :loading="coverBusy" @click="removeCover">Remove cover</UiButton>
        </div>
        <p v-if="coverError" class="field-error" role="alert">{{ coverError }}</p>
      </figcaption>
    </figure>

    <p v-if="!latest" class="notice warn gap" role="status">
      <UiIcon name="file" :size="16" />
      <span>You’re reading v{{ doc.version }}. The latest is v{{ doc.latest.version }}; new facts and notes go there. <NuxtLink :to="`/documents/${doc.latest.id}`">Open v{{ doc.latest.version }}</NuxtLink></span>
    </p>
    <p v-if="reextracted" class="notice gap" :class="reextracted.tone" :role="reextracted.tone === 'bad' ? 'alert' : 'status'">
      <UiIcon :name="reextracted.tone === 'bad' ? 'conflicts' : 'refresh'" :size="16" />
      <span>{{ reextracted.text }} <NuxtLink v-if="reextracted.review" to="/review">Open review</NuxtLink></span>
    </p>
    <p v-if="added" class="notice info gap" role="status">
      <UiIcon name="check" :size="16" />
      <span>
        <b>{{ added.to === 'canon' ? 'Added to canon.' : added.to === 'review' ? 'Sent to review.' : 'Note added.' }}</b>
        {{ added.text }}
        <NuxtLink v-if="added.entity" :to="`/entities/${added.entity.id}`">See {{ added.entity.name }}</NuxtLink>
        <NuxtLink v-else-if="added.to === 'review'" to="/review">Open review</NuxtLink>
      </span>
    </p>

    <div class="layout">
      <UiPanel class="doc">
        <ReaderTools :content="doc.content" :passages="doc.passages" :target="readerBox" />
        <p v-if="annotate" class="small faint hint"><UiIcon name="canon" :size="14" />Select words to add a fact or a note. <span class="hide-sm">Then press <kbd>F</kbd> or <kbd>N</kbd>.</span></p>
        <div ref="readerBox">
          <PassageReader :doc="doc" :active="active" :quote="activeQuote" :annotate="annotate" :notes="doc.notes" @saved="onSaved" @notes="showNotes" />
        </div>
      </UiPanel>

      <UiPanel as="aside" class="side">
        <UiTabs v-model="side" :items="sideTabs" class="side-tabs" />
        <template v-if="side === 'facts'">
          <p v-if="!doc.facts.length" class="small muted none">No canon facts or pending candidates cite this document.<template v-if="annotate"> Select words in the text to add one.</template></p>
          <ul v-else class="fact-list">
            <li v-for="f in doc.facts" :key="f.id" :class="{ current: here(f).some((ev: any) => ev.passage_id === active) }">
              <div class="fact-top">
                <UiBadge :tone="f.status === 'canon' ? 'accent' : 'pencil'">{{ f.status === 'canon' ? 'Canon' : 'Pending review' }}</UiBadge>
                <template v-for="ev in here(f)" :key="ev.id">
                  <NuxtLink v-if="ev.document_id !== doc.id" :to="`/documents/${ev.document_id}${ev.passage_id ? `#${ev.passage_id}` : ''}`" class="small line-link other" :title="ev.document_version < doc.version ? 'Cites an older version of this document. Re-check it still holds.' : undefined">
                    {{ ev.document_version < doc.version ? `Cites v${ev.document_version}, ${lineOf(ev).toLowerCase()} · re-check` : `Cites v${ev.document_version}` }}
                  </NuxtLink>
                  <NuxtLink v-else-if="ev.passage_id" :to="`#${ev.passage_id}`" class="small line-link">{{ lineOf(ev) }}</NuxtLink>
                  <span v-else class="small line-link bad">Quote not found in this source</span>
                </template>
              </div>
              <div class="statement">{{ f.statement }}</div>
              <span v-if="f.origin === 'human'" class="small faint">Added by {{ f.created_by_name ?? 'a teammate' }}</span>
              <NuxtLink v-if="f.status === 'pending'" :to="`/review?fact=${f.id}`" class="small">Review this candidate →</NuxtLink>
            </li>
          </ul>
        </template>
        <template v-else>
          <p v-if="!doc.notes.length" class="small muted none">No notes yet.<template v-if="annotate"> Select words in the text and choose Add note.</template></p>
          <ul v-else class="notes-list">
            <li v-for="n in sortedNotes" :key="n.id" :data-anchor="n.anchor">
              <NoteCard :note="n" @changed="refresh(); refreshNuxtData('stats')" />
            </li>
          </ul>
          <NuxtLink v-if="doc.notes.length" to="/notes" class="small all-notes">All notes in the project →</NuxtLink>
        </template>
      </UiPanel>
    </div>
  </template>
</template>

<style scoped>
.crumbs { display: flex; gap: var(--s-2); align-items: center; color: var(--muted); margin-bottom: var(--s-2); }
.crumbs a { color: var(--muted); }
.version-pick { width: auto; min-height: 26px; padding: 1px 28px 1px 8px; font-size: var(--text-xs); font-weight: 600; background-position: right 8px center; }
.meta { display: inline-flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.gap { margin-bottom: var(--s-4); }
.gap svg { flex: none; margin-top: 2px; }
.cover { margin: 0 0 var(--s-4); padding: 0; overflow: hidden; }
.cover img { display: block; width: 100%; max-height: 320px; object-fit: cover; background: var(--sunken); }
.cover figcaption { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); align-items: flex-start; justify-content: space-between; padding: var(--s-3) var(--s-4); border-top: 1px solid var(--line); }
.cover details { flex: 1 1 320px; min-width: 0; }
.cover summary { display: flex; flex-wrap: wrap; gap: 4px var(--s-2); align-items: center; cursor: pointer; color: var(--muted); }
.cover .prompt { margin: var(--s-2) 0 0; padding: var(--s-2) var(--s-3); border-left: 2px solid var(--line-strong); white-space: pre-line; color: var(--muted); overflow-wrap: anywhere; max-width: 70ch; }
.layout { display: grid; gap: var(--s-4); grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; }
.doc { padding: var(--s-5) var(--s-4); align-self: stretch; }
.hint { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0 0 var(--s-3); padding-left: 10px; }
.side { position: sticky; top: var(--s-5); max-height: calc(100vh - 2 * var(--s-5)); overflow-y: auto; padding-top: var(--s-2); }
.side-tabs { margin-bottom: var(--s-3); }
.none { margin: 0; }
.fact-list, .notes-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
.fact-list li { display: grid; gap: 6px; padding: var(--s-3); border-radius: var(--r-md); border: 1px solid var(--line); }
.fact-list li.current { border-color: var(--accent); background: var(--accent-soft); }
.fact-list .statement { font-size: var(--text-base); line-height: 1.5; }
.fact-top { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.line-link { color: var(--muted); font-variant-numeric: tabular-nums; }
.line-link.bad { color: var(--bad); text-decoration: none; }
.line-link.other { color: var(--warn); }
.all-notes { display: inline-block; margin-top: var(--s-3); }
@media (max-width: 900px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .side { position: static; max-height: none; }
}
@media (max-width: 720px) {
  .doc { padding: var(--s-3) var(--s-2); }
}
</style>
