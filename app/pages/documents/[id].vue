<script setup lang="ts">
const route = useRoute()
const editor = computed(() => canEdit(useMe().value))
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
</script>

<template>
  <UiPanel v-if="error">
    <UiEmptyState title="Document not found" icon="file">
      It may have been replaced by a newer import.
      <template #actions><UiButton to="/#sources">Back to sources</UiButton></template>
    </UiEmptyState>
  </UiPanel>
  <template v-else-if="doc">
    <nav class="crumbs small" aria-label="Breadcrumb">
      <NuxtLink to="/#sources">Sources</NuxtLink><span aria-hidden="true">/</span><span class="mono">{{ doc.filename }}</span>
    </nav>
    <UiPageHeader :title="doc.title">
      <span class="meta">
        <UiBadge>{{ doc.kind }}</UiBadge>
        <UiBadge>v{{ doc.version }}</UiBadge>
        <UiBadge tone="good" :title="doc.origin === 'written' ? 'Each save is a new version; saved versions never change' : 'Story Bible never edits imported sources'">Read-only source</UiBadge>
        <span v-if="doc.origin === 'written'" class="small muted">Written in Story Bible<template v-if="doc.created_by_name"> by {{ doc.created_by_name }}</template>, {{ savedAt(doc.imported_at) }}</span>
        <span class="mono faint" :title="`sha256 ${doc.sha256}`">sha256 {{ String(doc.sha256).slice(0, 12) }}…</span>
      </span>
      <template v-if="editor && doc.origin === 'written'" #actions>
        <UiButton icon="review" :to="`/write?doc=${doc.latest.id}`">Edit</UiButton>
      </template>
    </UiPageHeader>

    <p v-if="!latest" class="notice warn gap" role="status">
      <UiIcon name="file" :size="16" />
      <span>You’re reading v{{ doc.version }}. The latest is v{{ doc.latest.version }}; new facts and notes go there. <NuxtLink :to="`/documents/${doc.latest.id}`">Open v{{ doc.latest.version }}</NuxtLink></span>
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
        <p v-if="annotate" class="small faint hint"><UiIcon name="canon" :size="14" />Select words to add a fact or a note. <span class="hide-sm">Then press <kbd>F</kbd> or <kbd>N</kbd>.</span></p>
        <PassageReader :doc="doc" :active="active" :quote="activeQuote" :annotate="annotate" :notes="doc.notes" @saved="onSaved" @notes="showNotes" />
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
.meta { display: inline-flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.gap { margin-bottom: var(--s-4); }
.gap svg { flex: none; margin-top: 2px; }
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
