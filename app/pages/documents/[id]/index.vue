<script setup lang="ts">
const route = useRoute()
const me = useMe()
const editor = computed(() => canEdit(me.value))
const { data: doc, error, refresh } = await useFetch(() => `/api/documents/${route.params.id}`)
// :target does not update on client-side navigation, so highlight from the route hash.
const active = computed(() => route.hash.slice(1))
const lineOf = (ev: Record<string, any>) => (ev.start_ms != null ? `At ${clockMs(ev.start_ms)}` : `Line ${ev.start_line}${ev.end_line !== ev.start_line ? `–${ev.end_line}` : ''}`)
// Evidence from this document, any version. One that cites another version is shown as such, never as this text.
const here = (f: Record<string, any>) => f.evidence.filter((ev: any) => ev.document_key === doc.value?.filename)
const activeQuote = computed(() => doc.value?.facts.flatMap(f => f.evidence).find(ev => ev.verified && ev.passage_id === active.value)?.quote)
// Unfinished re-review tasks on this document (any version), grouped by the change that caused them.
const { data: allTasks } = await useFetch('/api/tasks', { default: () => [] })
const taskGroups = computed(() => {
  const g = new Map<string, { id: string, statement: string, n: number, first: string }>()
  for (const t of allTasks.value) {
    if (t.filename !== doc.value?.filename || (t.status !== 'open' && t.status !== 'in_progress')) continue
    const x = g.get(t.change_id) ?? { id: t.change_id, statement: t.change_statement, n: 0, first: t.id }
    x.n++
    g.set(t.change_id, x)
  }
  return [...g.values()]
})
// Tags are labels on the document (every version): the organise call never touches text or hash.
const { data: lib, refresh: refreshLib } = await useFetch('/api/library', { default: () => ({ tags: [] as { id: string, name: string }[] }) })
const allTags = computed(() => lib.value.tags as { id: string, name: string }[])
const hasTag = (id: string) => !!doc.value?.tags.some(t => t.id === id)
const tagError = ref('')
async function setTag(id: string, on: boolean) {
  try {
    tagError.value = ''
    await $fetch('/api/library/organise', { method: 'POST', body: { document_ids: [doc.value!.latest.id], [on ? 'add_tags' : 'remove_tags']: [id] } })
    await Promise.all([refresh(), refreshLib()])
  } catch (e) { tagError.value = errorMessage(e) }
}
const latest = computed(() => !doc.value || doc.value.latest.id === doc.value.id)
// Facts and notes are only added to the latest version: an older one is already superseded.
const annotate = computed(() => editor.value && latest.value)

type Side = 'facts' | 'notes' | 'images' | 'chat'
const side = ref<Side>(route.query.notes ? 'notes' : route.query.images ? 'images' : 'facts')
// The palette can open a note while this page is already showing: follow the link.
watch(() => route.fullPath, () => { if (route.query.notes) side.value = 'notes' })
const openNotes = computed(() => doc.value?.notes.filter(n => n.status !== 'done').length ?? 0)
const sideTabs = computed(() => [
  { value: 'facts' as Side, label: 'Facts', count: doc.value?.facts.length ?? 0 },
  { value: 'notes' as Side, label: 'Notes', count: openNotes.value },
  { value: 'images' as Side, label: 'Images', count: gallery.value?.images.length ?? 0 },
  { value: 'chat' as Side, label: 'Ask' },
])
// The chat sits in the side panel's Ask tab while the panel is beside the text (wide screens); ⌘/Ctrl+J, the floating button
// and "Research this" switch to it. Narrower, the panel drops below the text and they open the drawer instead.
const chat = useChat()
const wide = ref(false)
onMounted(() => {
  const mq = matchMedia('(min-width: 901px)')
  wide.value = mq.matches
  mq.addEventListener('change', e => { wide.value = e.matches })
})
useChatDock('reader', () => wide.value)
watch(() => chat.value.tick, async () => {
  if (chat.value.dock !== 'reader') return
  side.value = 'chat'
  await nextTick()
  document.querySelector<HTMLTextAreaElement>('.side-chat textarea')?.focus({ preventScroll: true })
})
// What this page is about, attached to a question as removable chips: the document, and the passage in the address.
useChatContext(() => {
  if (!doc.value) return []
  const p = doc.value.passages.find(x => x.id === active.value)
  return [{ type: 'document' as const, id: doc.value.id, label: doc.value.title },
    ...(p ? [{ type: 'passage' as const, id: p.id, label: `${doc.value.title}, line ${p.start_line}${p.end_line !== p.start_line ? `–${p.end_line}` : ''}` }] : [])]
})
// This version's image history (uploads and generated together); one of them may be the cover.
const { data: gallery, refresh: refreshImages } = await useFetch('/api/images', { query: computed(() => ({ target_type: 'document', target_id: String(route.params.id) })) })
const coverChanged = () => Promise.all([refresh(), refreshImages()])
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

// A cover (uploaded or generated) is editorial: shown above the source, never written into it.
const generator = ref<{ open: () => void }>()
const undo = ref('')
async function undoRemove() {
  const id = undo.value
  undo.value = ''
  try {
    await $fetch(`/api/images/${id}/apply`, { method: 'POST', body: { undo: true } })
    await coverChanged()
  } catch (e) {
    coverError.value = errorMessage(e)
  }
}
// Upload onto the cover (button or drop on the cover or its empty slot): the first image becomes the cover at once.
const coverInput = ref<HTMLInputElement>()
async function uploadCover(files: File[]) {
  coverError.value = ''
  if (!files.length) return
  const problem = files.map(imageUploadProblem).find(Boolean)
  if (problem) {
    coverError.value = problem
    return
  }
  coverBusy.value = true
  undo.value = ''
  try {
    const r = await sendImages('document', doc.value!.id, files.slice(0, IMAGE_BATCH_FILES), { apply: true })
    const refused = r.results.find(x => x.status === 'refused')
    if (refused) coverError.value = `${refused.name}: ${refused.message}`
    await coverChanged()
  } catch (e) {
    coverError.value = errorMessage(e)
  } finally {
    coverBusy.value = false
  }
}
function onCoverPick(ev: Event) {
  const input = ev.target as HTMLInputElement
  uploadCover([...input.files ?? []])
  input.value = ''
}
const { over: overCover, on: coverDrop } = useFileDrop(uploadCover, () => editor.value)
const coverBusy = ref(false)
const coverError = ref('')
async function removeCover() {
  coverBusy.value = true
  coverError.value = ''
  try {
    const id = doc.value!.cover!.id
    await $fetch(`/api/images/${id}/apply`, { method: 'DELETE' })
    await coverChanged()
    undo.value = id
  } catch (e) {
    coverError.value = errorMessage(e)
  } finally {
    coverBusy.value = false
  }
}
// Re-extract: runs extraction again on the latest version. It only ever adds pending candidates.
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
      reextracted.value = { tone: 'warn', text: 'Nothing was proposed for this document. Connect a model key to extract from it, or select words in the text to add a fact.' }
    else if (r.created)
      reextracted.value = { tone: 'info', text: `${counted(r.created, 'new candidate')} sent to review from v${r.version}${r.unverified ? `, ${r.unverified} with a quote not found in the text` : ''}.${skipLine}`, review: true }
    else
      reextracted.value = { tone: 'info', text: `Nothing new in v${r.version}.${skipLine || ' The AI proposed nothing.'}` }
    await Promise.all([refresh(), refreshNuxtData('stats')])
  } catch (e) {
    reextracted.value = { tone: 'bad', text: errorMessage(e) }
  } finally {
    reextracting.value = false
  }
}
// A recording: the full player shares the one audio element with the passages' play buttons.
const clip = useClip()
const audioEl = ref<HTMLAudioElement | null>(null)
watch(audioEl, a => clip.attach(a))
onBeforeUnmount(() => clip.attach(null))
const transcribing = ref(false)
const transcribed = ref<{ tone: 'info' | 'bad', text: string }>()
async function transcribeAgain() {
  transcribing.value = true
  transcribed.value = undefined
  try {
    const r = await $fetch(`/api/documents/${doc.value!.id}/transcribe`, { method: 'POST' }) as Record<string, any>
    if (r.status === 'duplicate') transcribed.value = { tone: 'info', text: `The new transcript reads the same as v${r.same_as.version}, so no version was added.` }
    else await navigateTo(`/documents/${r.document_id}`)
  } catch (e) {
    transcribed.value = { tone: 'bad', text: errorMessage(e) }
  } finally {
    transcribing.value = false
  }
}
const readerBox = ref<HTMLElement>()
const pickVersion = (id: string) => navigateTo(`/documents/${id}`)
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
        <span v-for="t in doc.tags" :key="t.id" class="tag-chip">
          <NuxtLink :to="{ path: '/library', query: { tag: t.id } }" :title="`Show every document tagged ${t.name}`"><UiBadge :tone="(t.color as TagTone)">{{ t.name }}</UiBadge></NuxtLink>
          <button v-if="editor" type="button" class="tag-x" :aria-label="`Remove tag ${t.name}`" title="Remove tag" @click="setTag(t.id, false)"><UiIcon name="close" :size="12" /></button>
        </span>
        <span v-if="tagError" class="field-error" role="alert">{{ tagError }}</span>
        <UiMenu v-if="editor" label="Tags" class="tag-menu">
          <template #trigger><UiIcon name="tag" :size="14" />{{ doc.tags.length ? 'Tags' : 'Add tag' }}</template>
          <template #default>
            <button v-for="t in allTags" :key="t.id" type="button" class="menu-item" role="menuitemcheckbox" :aria-checked="hasTag(t.id)" @click="setTag(t.id, !hasTag(t.id))">
              <UiIcon :name="hasTag(t.id) ? 'checked' : 'square'" :size="16" />{{ t.name }}
            </button>
            <p v-if="!allTags.length" class="menu-label">No tags yet.</p>
            <NuxtLink to="/library" class="menu-item"><UiIcon name="tag" :size="16" />Manage tags in Library</NuxtLink>
          </template>
        </UiMenu>
        <UiBadge v-if="doc.recording" tone="good" title="The transcript is the source: quotes match it word for word. Transcribing again makes a new version; it is never edited.">Read-only transcript</UiBadge>
        <UiBadge v-else tone="good" :title="doc.origin === 'written' ? 'Each save is a new version; saved versions never change' : 'CanonTracker never edits imported sources; Edit saves your changes as a new version'">{{ doc.origin === 'written' ? 'Saved version' : 'Read-only source' }}</UiBadge>
        <span v-if="doc.origin === 'written'" class="small muted">Written in CanonTracker<template v-if="doc.created_by_name"> by {{ doc.created_by_name }}</template>, {{ shortDate(doc.imported_at) }}</span>
        <span class="mono faint" :title="`sha256 ${doc.sha256}`">sha256 {{ String(doc.sha256).slice(0, 12) }}…</span>
      </span>
      <template #actions>
        <a v-if="doc.original" class="btn" :href="`/api/documents/${doc.id}/original`" download title="The .docx exactly as it was uploaded. The text here was converted from it."><UiIcon name="download" :size="16" />Original Word file</a>
        <UiButton icon="history" :to="`/documents/${doc.id}/history`">History<template v-if="doc.versions.length > 1"> · {{ doc.versions.length }}</template></UiButton>
        <template v-if="editor">
          <UiButton v-if="latest" icon="refresh" :loading="reextracting" :title="'Run extraction again; new candidates go to review'" @click="reextract">Re-extract</UiButton>
          <UiButton v-if="latest && !doc.recording" icon="review" :to="`/write?doc=${doc.latest.id}`">Edit</UiButton>
        </template>
      </template>
    </UiPageHeader>
    <ImageGenerator v-if="editor" :id="doc.id" ref="generator" type="document" @changed="coverChanged" />
    <UndoToast v-if="undo" message="Cover removed. It stays in Images." @undo="undoRemove" @close="undo = ''" />
    <input v-if="editor" ref="coverInput" type="file" :accept="IMAGE_UPLOAD_TYPES.join(',')" hidden @change="onCoverPick">

    <figure v-if="doc.cover" class="cover panel" :class="{ over: overCover }" v-on="coverDrop">
      <img :src="doc.cover.url" :alt="doc.cover.caption || `Cover for ${doc.title}`">
      <span v-if="overCover" class="cover-drop" aria-hidden="true"><UiIcon name="upload" :size="22" />Drop to replace the cover</span>
      <figcaption>
        <details v-if="doc.cover.source === 'generated'" class="small">
          <summary class="expand"><UiBadge tone="pencil">Generated by AI</UiBadge> Cover by {{ doc.cover.created_by_name ?? 'unknown' }}, {{ shortDate(doc.cover.created_at) }}</summary>
          <p class="prompt">{{ doc.cover.prompt }}</p>
        </details>
        <p v-else class="small up-note">
          <UiBadge><UiIcon name="upload" :size="12" />Uploaded</UiBadge> Cover uploaded by {{ doc.cover.created_by_name ?? 'unknown' }}, {{ shortDate(doc.cover.created_at) }}<template v-if="doc.cover.caption"> · {{ doc.cover.caption }}</template>
        </p>
        <div v-if="editor" class="row">
          <UiButton size="sm" icon="upload" :loading="coverBusy" @click="coverInput?.click()">Replace</UiButton>
          <UiButton size="sm" icon="image" :disabled="coverBusy" @click="generator?.open()">Generate</UiButton>
          <UiButton size="sm" variant="ghost" :disabled="coverBusy" @click="removeCover">Remove cover</UiButton>
        </div>
        <p v-if="coverError" class="field-error" role="alert">{{ coverError }}</p>
      </figcaption>
    </figure>
    <div v-else-if="editor" class="cover-slot" :class="{ over: overCover }" v-on="coverDrop">
      <UiIcon name="image" :size="18" />
      <span class="small muted"><template v-if="overCover">Drop to use it as the cover</template><template v-else>No cover yet.<span class="hide-sm"> Drop an image here, or</span></template></span>
      <div v-if="!overCover" class="row">
        <UiButton size="sm" icon="upload" :loading="coverBusy" @click="coverInput?.click()">Upload cover</UiButton>
        <UiButton size="sm" icon="image" :disabled="coverBusy" @click="generator?.open()">Generate cover</UiButton>
      </div>
      <p v-if="coverError" class="field-error" role="alert">{{ coverError }}</p>
    </div>

    <UiPanel v-if="doc.recording" class="rec">
      <audio ref="audioEl" class="rec-audio" controls preload="metadata" :src="doc.recording.audio" />
      <div class="rec-info">
        <p class="small muted">
          <UiIcon name="mic" :size="14" /> {{ clockMs(doc.recording.duration_ms) }} of audio · {{ counted(doc.passages.length, 'timed passage') }}.
          Transcribed by AI; the transcript is the source, and quotes are checked against it, not the audio.
        </p>
        <p class="small">
          <template v-if="doc.recording.script">Script: <NuxtLink :to="`/documents/${doc.recording.script.id}`">{{ doc.recording.script.title }}</NuxtLink></template>
          <span v-else class="muted">Not compared with a script yet.</span>
        </p>
      </div>
      <div class="row">
        <UiButton icon="dialogue" :to="`/documents/${doc.id}/script`">{{ doc.recording.script ? 'Script vs recording' : 'Compare with a script' }}</UiButton>
        <UiButton v-if="editor && latest" icon="refresh" variant="ghost" :loading="transcribing" title="Transcribe the audio again; a different transcript becomes a new version" @click="transcribeAgain">Transcribe again</UiButton>
      </div>
      <p v-if="transcribed" class="notice" :class="transcribed.tone" :role="transcribed.tone === 'bad' ? 'alert' : 'status'">{{ transcribed.text }}</p>
    </UiPanel>

    <p v-for="g in taskGroups" :key="g.id" class="notice warn gap" role="status">
      <UiIcon name="tasks" :size="16" />
      <span>{{ counted(g.n, 're-review task') }} from change “{{ g.statement.length > 70 ? `${g.statement.slice(0, 70)}…` : g.statement }}”. <NuxtLink :to="`/tasks?change=${g.id}&doc=${encodeURIComponent(doc.filename)}`">Open tasks</NuxtLink></span>
    </p>
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
        <p v-if="annotate" class="small faint hint"><UiIcon name="canon" :size="14" />Select words to add a fact, an entity or a note, to research them or to check their continuity. <span class="hide-sm">Then press <kbd>F</kbd>, <kbd>E</kbd>, <kbd>N</kbd>, <kbd>R</kbd> or <kbd>C</kbd>.</span></p>
        <p v-else class="small faint hint"><UiIcon name="research" :size="14" />Select words to research them or check their continuity. <span class="hide-sm">Then press <kbd>{{ keyLabel('reader.research') }}</kbd> or <kbd>{{ keyLabel('reader.continuity') }}</kbd>.</span></p>
        <div ref="readerBox">
          <PassageReader :doc="doc" :active="active" :quote="activeQuote" :annotate="annotate" research :notes="doc.notes" @saved="onSaved" @notes="showNotes" />
        </div>
      </UiPanel>

      <UiPanel as="aside" class="side" :class="{ chatting: side === 'chat' }">
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
              <span v-else-if="f.origin === 'sample'" class="small faint">Sample canon (preloaded)</span>
              <NuxtLink v-if="f.status === 'pending'" :to="`/review?fact=${f.id}`" class="small">Review this candidate →</NuxtLink>
            </li>
          </ul>
        </template>
        <ChatThread v-else-if="side === 'chat'" v-model:conv="chat.conv" contained class="side-chat">
          <template #empty><p class="small muted chat-empty">Ask about this document. Canon answers from accepted canon only; Research looks outside and never becomes canon. The whole team sees the conversation.</p></template>
        </ChatThread>
        <ImageHistory v-else-if="side === 'images' && gallery" v-model:images="gallery.images" type="document" :id="doc.id" :name="doc.title" noun="cover" :editable="editor" @changed="coverChanged" />
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
.tag-menu :deep(.menu-pop) { min-width: 220px; }
.tag-chip { display: inline-flex; align-items: center; gap: 2px; }
.tag-chip a { text-decoration: none; }
.tag-x { display: inline-grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--muted); cursor: pointer; }
.tag-x:hover { color: var(--bad, var(--ink)); background: var(--sunken); }
.crumbs { display: flex; gap: var(--s-2); align-items: center; color: var(--muted); margin-bottom: var(--s-2); }
.crumbs a { color: var(--muted); }
.version-pick { width: auto; min-height: 26px; padding: 1px 28px 1px 8px; font-size: var(--text-xs); font-weight: 600; background-position: right 8px center; }
.meta { display: inline-flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.gap { margin-bottom: var(--s-4); }
.gap svg { flex: none; margin-top: 2px; }
.cover { position: relative; margin: 0 0 var(--s-4); padding: 0; overflow: hidden; }
.cover.over, .cover-slot.over { outline: 2px dashed var(--accent); outline-offset: 2px; }
.cover-drop { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: var(--s-2); background: color-mix(in srgb, var(--raised) 80%, transparent); color: var(--accent); font-weight: 600; pointer-events: none; }
.cover-slot { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); align-items: center; margin: 0 0 var(--s-4); padding: var(--s-3) var(--s-4); border: 1px dashed var(--line-strong); border-radius: var(--r-lg); background: var(--pencil-soft); color: var(--faint); }
.cover-slot .field-error { flex-basis: 100%; margin: 0; }
.up-note { display: flex; flex: 1 1 320px; flex-wrap: wrap; gap: 4px var(--s-2); align-items: center; margin: 0; color: var(--muted); }
.up-note .chip { gap: 4px; }
.cover img { display: block; width: 100%; max-height: 320px; object-fit: cover; background: var(--sunken); }
.cover figcaption { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); align-items: flex-start; justify-content: space-between; padding: var(--s-3) var(--s-4); border-top: 1px solid var(--line); }
.cover details { flex: 1 1 320px; min-width: 0; }
.cover summary { display: flex; flex-wrap: wrap; gap: 4px var(--s-2); align-items: center; cursor: pointer; color: var(--muted); }
.cover .prompt { margin: var(--s-2) 0 0; padding: var(--s-2) var(--s-3); border-left: 2px solid var(--line-strong); white-space: pre-line; color: var(--muted); overflow-wrap: anywhere; max-width: 70ch; }
.rec { display: grid; gap: var(--s-3); margin-bottom: var(--s-4); }
.rec-audio { width: 100%; }
.rec-info p { margin: 0; }
.rec-info svg { vertical-align: -2px; }
.rec .notice { margin: 0; }
.layout { display: grid; gap: var(--s-4); grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; }
.doc { padding: var(--s-5) var(--s-4); align-self: stretch; }
.hint { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0 0 var(--s-3); padding-left: 10px; }
.side { position: sticky; top: var(--s-5); max-height: calc(100vh - 2 * var(--s-5)); overflow-y: auto; padding-top: var(--s-2); }
.side-tabs { margin-bottom: var(--s-3); }
.side.chatting { display: flex; flex-direction: column; height: calc(100vh - 2 * var(--s-5)); overflow: hidden; padding-bottom: 0; }
.side-chat { flex: 1; min-height: 0; margin: 0 calc(-1 * var(--s-4)); }
.chat-empty { margin: var(--s-2) 0; }
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
  .version-pick { min-height: 44px; }
  .doc { padding: var(--s-3) var(--s-2); }
}
</style>
