<script setup lang="ts">
import type { IconName } from '~/components/ui/Icon.vue'

const route = useRoute()
const router = useRouter()
const me = useMe()
const { data: e, error: loadError, refresh } = await useFetch(() => `/api/entities/${route.params.id}`)
// The image history (uploads and generated together) for the Images tab and its count.
const { data: gallery, refresh: refreshImages } = await useFetch('/api/images', { query: computed(() => ({ target_type: 'entity', target_id: String(route.params.id) })) })
useHead(() => ({ title: `${e.value?.name ?? 'Entity'} · Story Bible` }))
useChatContext(() => (e.value ? [{ type: 'entity' as const, id: e.value.id, label: e.value.name }] : []))
const editable = computed(() => canEdit(me.value))
const manager = computed(() => canManage(me.value))
const { data: types } = await useEntityTypes()
const kindLabel = useKind()

// Hand-typed aliases are edited here; names a merge mapped to this page are shown apart, and the name canon uses for it
// when neither the title nor an alias still says it.
const isMerged = (n: string) => !!e.value?.merged_from.some(m => normName(m) === normName(n))
const handAliases = computed(() => e.value?.aliases.filter(a => !isMerged(a)) ?? [])
const canonName = computed(() => {
  const v = e.value
  return v && ![v.name, ...v.aliases, ...v.merged_from].some(n => normName(n) === normName(v.analysis_name)) ? v.analysis_name : ''
})

// Tabs live in the URL so a writer can link straight to a character's relationships.
const TABS = ['story', 'timeline', 'relationships', 'appearances', 'images', 'notes'] as const
type Tab = typeof TABS[number]
const tab = computed<Tab>({
  get: () => (TABS.includes(route.query.tab as Tab) ? route.query.tab as Tab : 'story'),
  set: v => router.replace({ query: { ...route.query, tab: v === 'story' ? undefined : v, merged: undefined } }),
})
const facts = computed(() => e.value?.facts ?? [])
const relCount = computed(() => facts.value.filter(f => f.object).length)
const timedCount = computed(() => facts.value.filter(f => f.t_from != null || f.t_to != null).length)
const openNotes = computed(() => e.value?.text_notes.filter(n => n.status !== 'done').length ?? 0)
const passageCount = computed(() => e.value?.appearances.reduce((n, d) => n + d.passages.length, 0) ?? 0)
const tabs = computed(() => [
  { value: 'story' as Tab, label: 'Story' },
  { value: 'timeline' as Tab, label: 'Timeline', count: timedCount.value },
  { value: 'relationships' as Tab, label: 'Relationships', count: relCount.value },
  { value: 'appearances' as Tab, label: 'Appearances', count: passageCount.value },
  { value: 'images' as Tab, label: 'Images', count: gallery.value?.images.length ?? 0 },
  { value: 'notes' as Tab, label: 'Notes', count: openNotes.value || undefined },
])

// Key canon facts on the Story tab: everything except links to other entities (those are on Relationships).
const FACT_GROUPS = [['character', 'Who they are'], ['rule', 'Rules'], ['claim', 'Claims'], ['event', 'Events'], ['location', 'Places']] as const
const storyFacts = computed(() => FACT_GROUPS
  .map(([kind, label]) => ({ kind, label, facts: facts.value.filter(f => f.kind === kind) }))
  .filter(g => g.facts.length))
const linkedOnly = computed(() => facts.value.filter(f => f.kind === 'relationship').length)

// Fields for this project's medium and the page's kind, plus any value kept from another medium or kind.
const fieldKeys = computed(() => {
  if (!e.value) return []
  const preset = fieldsFor(e.value.medium, e.value.kind)
  return [...preset, ...Object.keys(e.value.fields).filter(k => !preset.includes(k))]
})
const presetKeys = computed(() => (e.value ? fieldsFor(e.value.medium, e.value.kind) : []))

// One edit at a time: details (name, kind, aliases), summary, fields or notes.
type Section = '' | 'details' | 'summary' | 'fields' | 'notes'
const editing = ref<Section>('')
const draft = reactive({ name: '', kind: '', aliases: [] as string[], alias: '', summary: '', fields: {} as Record<string, string>, notes: '' })
const saving = ref(false)
const saveError = ref('')
function edit(s: Section) {
  if (!e.value) return
  Object.assign(draft, { name: e.value.name, kind: e.value.kind, aliases: [...handAliases.value], alias: '', summary: e.value.summary, fields: { ...e.value.fields }, notes: e.value.notes })
  for (const k of fieldKeys.value) draft.fields[k] ??= ''
  saveError.value = ''
  editing.value = s
  panel.value = ''
  if (s === 'notes' && tab.value !== 'notes') tab.value = 'notes'
}
function addAlias() {
  const a = draft.alias.trim().replace(/,$/, '').trim()
  if (a && !draft.aliases.some(x => x.toLowerCase() === a.toLowerCase())) draft.aliases.push(a)
  draft.alias = ''
}
async function save(body: Record<string, unknown>) {
  saving.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/entities/${e.value!.id}`, { method: 'PATCH', body })
    await Promise.all([refresh(), refreshEntities()])
    editing.value = ''
  } catch (err) {
    saveError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}
function aliasKey(ev: KeyboardEvent) {
  if (ev.isComposing || ev.keyCode === 229 || ev.ctrlKey || ev.metaKey) return
  if (ev.key !== 'Enter' && ev.key !== ',') return
  ev.preventDefault()
  addAlias()
}
function saveDetails() {
  if (draft.alias.trim()) addAlias()
  save({ name: draft.name, kind: draft.kind, aliases: draft.aliases })
}

// Upload onto the portrait (button or drop): the first image becomes the portrait at once; any others join the history.
// Checked here for quick feedback, and again on the server by the file's bytes.
const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)
const portraitError = ref('')
async function uploadPortrait(files: File[]) {
  portraitError.value = ''
  if (!files.length) return
  const problem = files.map(imageUploadProblem).find(Boolean)
  if (problem) {
    portraitError.value = problem
    return
  }
  uploading.value = true
  try {
    const r = await sendImages('entity', e.value!.id, files.slice(0, IMAGE_BATCH_FILES), { apply: true })
    const refused = r.results.find(x => x.status === 'refused')
    if (refused) portraitError.value = `${refused.name}: ${refused.message}`
    await portraitChanged()
  } catch (err) {
    portraitError.value = errorMessage(err)
  } finally {
    uploading.value = false
  }
}
function onPortraitPick(ev: Event) {
  const input = ev.target as HTMLInputElement
  uploadPortrait([...input.files ?? []])
  input.value = ''
}
const { over: overPortrait, on: portraitDrop } = useFileDrop(uploadPortrait, () => editable.value)
// Removing the portrait can be undone: the image stays in the history.
const undo = ref<{ id: string, message: string } | null>(null)
async function removePortrait() {
  uploading.value = true
  portraitError.value = ''
  const gen = e.value!.portrait_image
  try {
    await $fetch(`/api/entities/${e.value!.id}/portrait`, { method: 'DELETE' })
    undo.value = gen ? { id: gen.id, message: `${noun.value === 'portrait' ? 'Portrait' : 'Image'} removed. It stays in Images.` } : null
    await portraitChanged()
  } catch (err) {
    portraitError.value = errorMessage(err)
  } finally {
    uploading.value = false
  }
}

// Generated portraits come from the dialog; it keeps every image with its prompt so an older one can be picked again.
const generator = ref<{ open: () => void }>()
const noun = computed(() => imageNoun('entity', e.value?.kind))
async function undoRemove() {
  const id = undo.value!.id
  undo.value = null
  try {
    await $fetch(`/api/images/${id}/apply`, { method: 'POST', body: { undo: true } })
    await portraitChanged()
  } catch (err) {
    portraitError.value = errorMessage(err)
  }
}
const portraitChanged = () => Promise.all([refresh(), refreshEntities(), refreshImages()])

// Merge and delete open a panel under the header.
const panel = ref<'' | 'merge' | 'delete'>('')
const inUse = computed(() => facts.value.length + (e.value?.pending ?? 0))
const deleting = ref(false)
const deleteError = ref('')
async function remove() {
  deleting.value = true
  deleteError.value = ''
  try {
    await $fetch(`/api/entities/${e.value!.id}`, { method: 'DELETE' })
    await refreshEntities()
    await navigateTo('/entities')
  } catch (err) {
    deleteError.value = errorMessage(err)
    deleting.value = false
  }
}
watch(() => route.params.id, () => {
  editing.value = ''
  panel.value = ''
})

// Appearances: this entity's own names marked inside each passage.
const ownPattern = computed(() => (e.value ? mentionPattern(e.value.names) : null))
function marked(text: string) {
  const re = ownPattern.value
  if (!re) return [{ text, hit: false }]
  const out: { text: string, hit: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false })
    out.push({ text: m[0], hit: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false })
  return out
}

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 6e4)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  return mins < 60 ? rtf.format(-mins, 'minute') : mins < 1440 ? rtf.format(-Math.round(mins / 60), 'hour') : rtf.format(-Math.round(mins / 1440), 'day')
}
</script>

<template>
  <UiPanel v-if="loadError || !e">
    <UiEmptyState title="Page not found" icon="entities">
      It may have been merged into another page or deleted.
      <template #actions><UiButton to="/entities">All entities</UiButton></template>
    </UiEmptyState>
  </UiPanel>

  <template v-else>
    <nav class="crumbs small" aria-label="Breadcrumb">
      <NuxtLink to="/entities">Entities</NuxtLink><span aria-hidden="true">/</span><span>{{ kindLabel(e.kind).many }}</span>
    </nav>

    <header class="hero">
      <div class="portrait">
        <div class="slot" :class="{ over: overPortrait }" v-on="portraitDrop">
          <EntityAvatar :entity="e" :size="104" />
          <span v-if="overPortrait" class="slot-drop" aria-hidden="true"><UiIcon name="upload" :size="20" />Set as {{ noun }}</span>
        </div>
        <div v-if="editable" class="portrait-actions">
          <input ref="fileInput" type="file" :accept="IMAGE_UPLOAD_TYPES.join(',')" hidden @change="onPortraitPick">
          <UiButton size="sm" icon="upload" :loading="uploading" @click="fileInput?.click()">{{ e.portrait ? 'Replace' : 'Upload' }}</UiButton>
          <UiButton size="sm" icon="image" :disabled="uploading" @click="generator?.open()">Generate</UiButton>
          <UiButton v-if="e.portrait" size="sm" variant="ghost" icon="trash" :disabled="uploading" :aria-label="`Remove ${noun}`" :title="`Remove ${noun}`" @click="removePortrait" />
        </div>
        <p v-if="portraitError" class="portrait-error" role="alert">{{ portraitError }}</p>
        <ImageGenerator v-if="editable" :id="e.id" ref="generator" type="entity" @changed="portraitChanged" />
        <UndoToast v-if="undo" :message="undo.message" @undo="undoRemove" @close="undo = null" />
      </div>
      <div class="ident">
        <div class="row">
          <UiBadge :class="`kt-${kindLabel(e.kind).color}`" class="type-badge"><UiIcon :name="kindLabel(e.kind).icon as IconName" :size="13" />{{ kindLabel(e.kind).one }}</UiBadge>
          <UiBadge v-if="e.origin === 'canon'" title="Story Bible made this page because accepted canon names it. The type is a guess; change it if it's wrong.">From canon</UiBadge>
        </div>
        <h1>{{ e.name }}</h1>
        <p v-if="handAliases.length" class="aliases">Also known as {{ handAliases.join(', ') }}</p>
        <p v-if="e.merged_from.length" class="merged small" title="A merge decided these are the same. Canon and mentions under these names link here.">
          <UiIcon name="merge" :size="14" />Merged from {{ e.merged_from.join(', ') }}
        </p>
        <p v-if="canonName" class="merged small" title="The name accepted canon uses for this page. Mentions of it link here.">Canon calls it {{ canonName }}</p>
        <p class="meta small faint">
          {{ counted(facts.length, 'canon fact') }} · {{ e.appearances.length ? `appears in ${counted(e.appearances.length, 'document')}` : 'not mentioned in any source' }}
          <template v-if="e.updated_by"> · edited by {{ e.updated_by }} {{ ago(e.updated_at) }}</template>
        </p>
        <details v-if="e.portrait_image?.source === 'generated'" class="gen-note small">
          <summary class="expand"><UiBadge tone="pencil">Generated with Muse Image</UiBadge> {{ noun === 'portrait' ? 'Portrait' : 'Image' }} by {{ e.portrait_image.created_by_name ?? 'unknown' }}, {{ shortDate(e.portrait_image.created_at) }}</summary>
          <p>{{ e.portrait_image.prompt }}</p>
        </details>
        <p v-else-if="e.portrait_image" class="gen-note small up-note">
          <UiBadge><UiIcon name="upload" :size="12" />Uploaded</UiBadge> {{ noun === 'portrait' ? 'Portrait' : 'Image' }} uploaded by {{ e.portrait_image.created_by_name ?? 'unknown' }}, {{ shortDate(e.portrait_image.created_at) }}<template v-if="e.portrait_image.caption"> · {{ e.portrait_image.caption }}</template>
        </p>
      </div>
      <div v-if="editable" class="actions">
        <UiButton icon="review" @click="edit('details')">Edit</UiButton>
        <UiButton icon="merge" :aria-pressed="panel === 'merge'" @click="panel = panel === 'merge' ? '' : 'merge'; editing = ''">Merge…</UiButton>
        <UiButton variant="ghost" icon="trash" :aria-pressed="panel === 'delete'" @click="panel = panel === 'delete' ? '' : 'delete'; editing = ''">Delete</UiButton>
      </div>
    </header>

    <p v-if="route.query.merged" class="notice info gap" role="status"><UiIcon name="check" :size="16" />Merged “{{ route.query.merged }}” into {{ e.name }}. The audit log has the details.</p>

    <UiPanel v-if="editing === 'details'" title="Edit details" class="gap">
      <form class="stack" novalidate @submit.prevent="saveDetails">
        <div class="details-row">
          <UiField label="Name" hint="If canon uses the old name, it stays as an alias so facts keep linking here.">
            <input v-model="draft.name" type="text" maxlength="80" required spellcheck="false" @keydown.esc="editing = ''">
          </UiField>
          <UiField label="Type">
            <select v-model="draft.kind">
              <option v-for="t in types" :key="t.key" :value="t.key">{{ t.one }}</option>
              <option v-if="!types.some(t => t.key === draft.kind)" :value="draft.kind" disabled>{{ kindLabel(draft.kind).one }} (removed)</option>
            </select>
          </UiField>
        </div>
        <div class="aliases-edit">
          <span class="label">Aliases</span>
          <ul v-if="draft.aliases.length" class="chips">
            <li v-for="(a, i) in draft.aliases" :key="a" class="chip-edit">
              {{ a }}
              <button type="button" :aria-label="`Remove alias ${a}`" @click="draft.aliases.splice(i, 1)"><UiIcon name="close" :size="14" /></button>
            </li>
          </ul>
          <div class="row">
            <input v-model="draft.alias" type="text" maxlength="80" spellcheck="false" placeholder="Add a nickname, title or full name" aria-label="New alias" class="alias-input" @keydown="aliasKey">
            <UiButton size="sm" :disabled="!draft.alias.trim()" @click="addAlias">Add</UiButton>
          </div>
          <span class="field-hint">Other names canon or your scripts use. Mentions of them link here.</span>
          <p v-if="e.merged_from.length" class="small muted merged-note">
            <UiIcon name="merge" :size="14" /><span>Merged from <b>{{ e.merged_from.join(', ') }}</b>. A merge keeps these, so canon and mentions under them keep linking here.</span>
          </p>
        </div>
        <p v-if="saveError" class="notice bad" role="alert">{{ saveError }}</p>
        <div class="row">
          <UiButton type="submit" variant="primary" :loading="saving">Save</UiButton>
          <UiButton variant="ghost" @click="editing = ''">Cancel</UiButton>
        </div>
      </form>
    </UiPanel>

    <EntityMerge v-if="panel === 'merge'" :entity="e" class="gap" @close="panel = ''" />

    <UiPanel v-if="panel === 'delete'" class="gap danger-panel">
      <div v-if="inUse" class="stack">
        <h2 class="panel-title">{{ e.name }} can’t be deleted</h2>
        <p class="muted">
          {{ counted(inUse, 'canon fact or candidate', 'canon facts or candidates') }} still name {{ e.name }}, so the page would come straight back.
          If it’s a duplicate, merge it into the page you keep.
        </p>
        <div class="row">
          <UiButton variant="primary" icon="merge" @click="panel = 'merge'">Merge instead…</UiButton>
          <UiButton variant="ghost" @click="panel = ''">Cancel</UiButton>
        </div>
      </div>
      <div v-else class="stack">
        <h2 class="panel-title">Delete {{ e.name }}’s page?</h2>
        <p class="muted">Its summary, fields, notes and portrait go away. Canon isn’t affected. The audit log keeps a copy of the text.</p>
        <p v-if="deleteError" class="notice bad" role="alert">{{ deleteError }}</p>
        <div class="row">
          <UiButton variant="danger" icon="trash" :loading="deleting" @click="remove">Delete page</UiButton>
          <UiButton variant="ghost" @click="panel = ''">Cancel</UiButton>
        </div>
      </div>
    </UiPanel>

    <UiTabs v-model="tab" :items="tabs" class="entity-tabs" />

    <!-- Story -->
    <div v-if="tab === 'story'" class="story-grid">
      <div class="stack main-col">
        <UiPanel title="Summary">
          <template v-if="editable && editing !== 'summary'" #actions>
            <UiButton size="sm" variant="ghost" icon="review" @click="edit('summary')">{{ e.summary ? 'Edit' : 'Write' }}</UiButton>
          </template>
          <form v-if="editing === 'summary'" class="stack" novalidate @submit.prevent="save({ summary: draft.summary })">
            <UiField label="Summary" hint="Who or what this is, in a line or two. Your team’s words, not canon.">
              <textarea v-model="draft.summary" rows="4" maxlength="2000" autofocus @keydown.esc="editing = ''" />
            </UiField>
            <p v-if="saveError" class="notice bad" role="alert">{{ saveError }}</p>
            <div class="row">
              <UiButton type="submit" size="sm" variant="primary" :loading="saving">Save</UiButton>
              <UiButton size="sm" variant="ghost" @click="editing = ''">Cancel</UiButton>
            </div>
          </form>
          <p v-else-if="e.summary" class="summary">{{ e.summary }}</p>
          <p v-else class="muted none">No summary yet.<template v-if="editable"> Write one so mentions show it on hover.</template></p>
        </UiPanel>

        <UiPanel title="What canon says" :description="facts.length ? `Accepted facts that name ${e.name}, each with the passage it came from.` : undefined">
          <p v-if="e.pending" class="notice info pending">
            <UiIcon name="review" :size="16" />
            <span>{{ counted(e.pending, 'candidate') }} about {{ e.name }} {{ e.pending === 1 ? 'is' : 'are' }} waiting for review. <NuxtLink to="/review">Review</NuxtLink></span>
          </p>
          <p v-if="!facts.length" class="muted none">
            Nothing in canon names {{ e.name }} yet. Accept candidates that mention it, or add an alias if canon uses another name.
          </p>
          <div v-else class="fact-groups">
            <section v-for="g in storyFacts" :key="g.kind">
              <h3>{{ g.label }}</h3>
              <div class="stack">
                <div v-for="f in g.facts" :key="f.id" class="fact-item">
                  <FactSummary :fact="f" sources />
                </div>
              </div>
            </section>
            <p v-if="linkedOnly" class="small muted">
              Family, allies and other links are grouped on the <button type="button" class="linkish" @click="tab = 'relationships'">Relationships</button> tab.
            </p>
          </div>
        </UiPanel>
      </div>

      <UiPanel as="aside" :title="`${MEDIA[e.medium].label} details`" class="side-col">
        <template v-if="editable && editing !== 'fields' && fieldKeys.length" #actions>
          <UiButton size="sm" variant="ghost" icon="review" @click="edit('fields')">Edit</UiButton>
        </template>
        <p class="small faint side-note">Notes for your team. Not canon; never used for conflicts or impact.</p>
        <p v-if="!fieldKeys.length" class="small muted none">No fields for {{ typeWord(kindLabel(e.kind).one) }} pages. Use the summary and notes.</p>
        <form v-else-if="editing === 'fields'" class="stack" novalidate @submit.prevent="save({ fields: draft.fields })">
          <UiField v-for="k in fieldKeys" :key="k" :label="FIELD_LABEL[k]?.label ?? k" :hint="presetKeys.includes(k) ? FIELD_LABEL[k]?.hint : 'Kept from another medium or kind. Clear it to remove.'">
            <textarea v-model="draft.fields[k]" rows="2" maxlength="500" @keydown.esc="editing = ''" />
          </UiField>
          <p v-if="saveError" class="notice bad" role="alert">{{ saveError }}</p>
          <div class="row">
            <UiButton type="submit" size="sm" variant="primary" :loading="saving">Save</UiButton>
            <UiButton size="sm" variant="ghost" @click="editing = ''">Cancel</UiButton>
          </div>
        </form>
        <dl v-else class="fields">
          <div v-for="k in fieldKeys" :key="k">
            <dt>{{ FIELD_LABEL[k]?.label ?? k }}</dt>
            <dd v-if="e.fields[k]">{{ e.fields[k] }}</dd>
            <dd v-else class="faint">—</dd>
          </div>
        </dl>
        <div class="medium">
          <span class="small faint">Fields for a {{ MEDIA[e.medium].label.toLowerCase() }} project.</span>
          <UiButton v-if="manager" size="sm" icon="settings" :to="`/settings/projects/${me?.current?.project.id}`">Change medium</UiButton>
        </div>
      </UiPanel>
    </div>

    <!-- Timeline -->
    <UiPanel v-else-if="tab === 'timeline'" :title="`${e.name} on the story timeline`" description="Timed canon facts that name this entity, by story time. Day 1 starts at 00:00; earlier days are D0, D-1, ….">
      <StoryTimeline v-if="timedCount" :facts="facts" />
      <UiEmptyState v-else title="No timed facts yet" icon="event">
        None of the accepted facts about {{ e.name }} has a story time.
      </UiEmptyState>
    </UiPanel>

    <!-- Relationships -->
    <EntityRelations v-else-if="tab === 'relationships'" :entity="e" :editable="editable" />

    <!-- Appearances -->
    <template v-else-if="tab === 'appearances'">
      <UiEmptyState v-if="!e.appearances.length" title="Not mentioned in any source" icon="file">
        No passage in the latest version of your sources mentions {{ e.name }}{{ e.names.length > 1 ? ' or its other names' : '' }}.
      </UiEmptyState>
      <div v-else class="stack apps">
        <p class="small muted intro">Passages in your sources that mention {{ e.name }}{{ e.names.length > 1 ? ' or its other names' : '' }}, found by name when you open this page. Open one to read it in place.</p>
        <UiPanel v-for="d in e.appearances" :key="d.id" flush>
          <header class="app-head">
            <UiIcon name="file" :size="16" />
            <NuxtLink :to="`/documents/${d.id}`" class="app-title">{{ d.title }}</NuxtLink>
            <UiBadge>{{ d.kind }}</UiBadge>
            <span class="small faint">{{ counted(d.passages.length, 'passage') }}</span>
          </header>
          <ol class="passages">
            <li v-for="p in d.passages" :key="p.id">
              <NuxtLink :to="`/documents/${d.id}#${p.id}`" class="p-link">
                <span class="ln mono">{{ p.start_line }}<template v-if="p.end_line !== p.start_line">–{{ p.end_line }}</template></span>
                <span class="p-text"><template v-for="(s, i) in marked(p.text)" :key="i"><mark v-if="s.hit">{{ s.text }}</mark><template v-else>{{ s.text }}</template></template></span>
                <UiBadge v-if="p.cited" tone="accent" class="cited" title="A canon fact about this entity cites this passage">Cited in canon</UiBadge>
              </NuxtLink>
            </li>
          </ol>
        </UiPanel>
      </div>
    </template>

    <UiPanel v-else-if="tab === 'images'" :title="`Images of ${e.name}`" :description="`Concept art, references and generated images. Editorial only, never canon. Pick any of them as the ${noun}.`">
      <template v-if="editable" #actions><UiButton size="sm" icon="image" @click="generator?.open()">Generate</UiButton></template>
      <ImageHistory v-if="gallery" v-model:images="gallery.images" type="entity" :id="e.id" :name="e.name" :noun="noun" :editable="editable" @changed="portraitChanged" />
      <p v-else class="muted none">Images couldn’t be loaded. Reload the page to try again.</p>
    </UiPanel>

    <!-- Notes -->
    <div v-else class="stack notes-tab">
    <UiPanel title="Notes on the text" :description="`Notes pinned to passages that mention ${e.name}. Not canon.`">
      <ul v-if="e.text_notes.length" class="text-notes">
        <li v-for="n in e.text_notes" :key="n.id"><NoteCard :note="n" source @changed="refresh(); refreshNuxtData('stats')" /></li>
      </ul>
      <p v-else class="muted none">No notes on passages that mention {{ e.name }}.<template v-if="editable"> Select words in a source and choose Add note.</template></p>
    </UiPanel>
    <UiPanel title="Page notes" description="Working notes for the team: open questions, references, voice lines. Not canon.">
      <template v-if="editable && editing !== 'notes'" #actions>
        <UiButton size="sm" variant="ghost" icon="review" @click="edit('notes')">{{ e.notes ? 'Edit' : 'Write' }}</UiButton>
      </template>
      <form v-if="editing === 'notes'" class="stack" novalidate @submit.prevent="save({ notes: draft.notes })">
        <UiField label="Notes" hint="**bold**, *italic*, “- ” for lists and “# ” for a heading. Leave a blank line between paragraphs.">
          <textarea v-model="draft.notes" rows="12" maxlength="20000" autofocus class="notes-input" @keydown.esc="editing = ''" />
        </UiField>
        <p v-if="saveError" class="notice bad" role="alert">{{ saveError }}</p>
        <div class="row">
          <UiButton type="submit" size="sm" variant="primary" :loading="saving">Save notes</UiButton>
          <UiButton size="sm" variant="ghost" @click="editing = ''">Cancel</UiButton>
        </div>
      </form>
      <!-- eslint-disable-next-line vue/no-v-html -- notesHtml escapes the text before adding its few tags -->
      <div v-else-if="e.notes" class="notes" v-html="notesHtml(e.notes)" />
      <UiEmptyState v-else title="No notes yet" icon="review">
        Keep what doesn’t belong in canon here: open questions, references, voice lines.
        <template v-if="editable" #actions><UiButton @click="edit('notes')">Write notes</UiButton></template>
      </UiEmptyState>
    </UiPanel>
    </div>
  </template>
</template>

<style scoped>
.crumbs { display: flex; gap: var(--s-2); align-items: center; color: var(--muted); margin-bottom: var(--s-3); }
.crumbs a { color: var(--muted); }
.hero { display: flex; gap: var(--s-5); align-items: flex-start; flex-wrap: wrap; margin-bottom: var(--s-5); }
.portrait { display: grid; gap: var(--s-2); justify-items: center; width: 256px; }  /* fixed so the header does not shift when Remove appears */
.portrait-actions { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
.slot { position: relative; display: grid; border-radius: var(--r-md); }
.slot.over { outline: 2px dashed var(--accent); outline-offset: 3px; }
.slot-drop { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 2px; border-radius: var(--r-md); background: color-mix(in srgb, var(--raised) 85%, transparent); color: var(--accent); font-size: var(--text-xs); font-weight: 600; pointer-events: none; }
.up-note { display: flex; flex-wrap: wrap; gap: 4px var(--s-2); align-items: center; margin: 0; color: var(--muted); }
.up-note .chip { gap: 4px; }
.ident { flex: 1 1 320px; min-width: 0; display: grid; gap: var(--s-1); align-content: start; }
.ident h1 { margin: var(--s-1) 0 0; font-size: var(--text-2xl); line-height: 1.2; overflow-wrap: anywhere; }
.ident .chip { gap: 5px; }
.ident .type-badge { background: var(--tone-soft); color: var(--tone); }
.aliases { margin: 0; color: var(--muted); }
.merged { margin: 0; display: flex; align-items: center; gap: 6px; color: var(--muted); }
.merged svg { flex: none; color: var(--faint); }
.merged-note { margin: 0; display: flex; gap: 6px; align-items: flex-start; }
.merged-note svg { flex: none; margin-top: 3px; color: var(--faint); }
.portrait-error { margin: 0; max-width: 200px; font-size: var(--text-sm); font-weight: 500; color: var(--bad); text-align: center; }
.meta { margin: 0; }
.gen-note { margin-top: var(--s-1); max-width: 70ch; }
.gen-note summary { display: flex; flex-wrap: wrap; gap: 4px var(--s-2); align-items: center; cursor: pointer; color: var(--muted); }
.gen-note p { margin: var(--s-2) 0 0; padding: var(--s-2) var(--s-3); border-left: 2px solid var(--line-strong); white-space: pre-line; color: var(--muted); overflow-wrap: anywhere; }
.actions { display: flex; gap: var(--s-2); flex-wrap: wrap; }
.gap { margin-bottom: var(--s-5); }
.details-row { display: grid; grid-template-columns: 1fr 180px; gap: var(--s-3); max-width: 640px; align-items: start; }
.aliases-edit { display: grid; gap: var(--s-2); max-width: 640px; }
.aliases-edit .label { font-weight: 500; font-size: var(--text-sm); }
.alias-input { flex: 1 1 220px; }
.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.chip-edit { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 10px; border: 1px solid var(--line-strong); border-radius: var(--r-md); background: var(--surface); font-size: var(--text-sm); }
.chip-edit button { display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: var(--r-sm); background: none; color: var(--muted); cursor: pointer; }
.chip-edit button:hover { background: var(--sunken); color: var(--bad); }
.danger-panel { border-color: color-mix(in srgb, var(--bad) 35%, var(--line)); }
.panel-title { margin: 0; font-size: var(--text-md); }
.danger-panel p { margin: 0; max-width: 64ch; }
.entity-tabs { margin-bottom: var(--s-5); }
.story-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--s-4); align-items: start; }
.main-col { gap: var(--s-4); }
.summary { margin: 0; font-size: var(--text-md); line-height: 1.6; max-width: 68ch; white-space: pre-line; }
.none { margin: 0; }
.pending { margin-bottom: var(--s-4); }
.pending svg { flex: none; margin-top: 2px; }
.fact-groups { display: grid; gap: var(--s-5); }
.fact-groups h3 { margin: 0 0 var(--s-2); font-size: var(--text-sm); font-weight: 600; color: var(--muted); }
.fact-item { padding: var(--s-3) var(--s-4); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--canvas); }
.linkish { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--accent); cursor: pointer; text-decoration: underline; }
.side-note { margin: calc(-1 * var(--s-3)) 0 var(--s-3); }
.fields { margin: 0; display: grid; gap: var(--s-3); }
.fields dt { font-size: var(--text-xs); font-weight: 600; color: var(--faint); }
.fields dd { margin: 2px 0 0; white-space: pre-line; overflow-wrap: anywhere; }
.medium { display: grid; justify-items: start; gap: var(--s-2); margin: var(--s-4) 0 0; padding-top: var(--s-3); border-top: 1px solid var(--line); }
.medium .btn { white-space: nowrap; }
.intro { margin: 0; max-width: 72ch; }
.app-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--line); background: var(--surface); }
.app-head svg { color: var(--muted); }
.app-title { font-weight: 600; color: var(--ink); }
.passages { list-style: none; margin: 0; padding: 0; }
.passages li + li { border-top: 1px solid var(--line); }
.p-link { display: grid; grid-template-columns: 10ch minmax(0, 1fr) auto; gap: var(--s-3); padding: var(--s-3) var(--s-4); color: var(--ink); text-decoration: none; }
.p-link:hover { background: var(--surface); color: var(--ink); }
.p-link:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.cited { align-self: start; margin-top: 3px; }
.ln { color: var(--faint); font-size: var(--text-xs); text-align: right; padding-top: 4px; }
.p-text { font-family: var(--font-story); font-size: var(--text-md); line-height: 1.6; max-width: 70ch; }
.p-text mark { background: color-mix(in srgb, var(--accent) 22%, transparent); color: inherit; border-radius: 2px; padding: 0 1px; }
.notes-tab { gap: var(--s-4); }
.text-notes { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); max-width: 760px; }
.notes { max-width: 70ch; line-height: 1.65; }
.notes :deep(p), .notes :deep(ul) { margin: 0 0 var(--s-3); }
.notes :deep(h3) { margin: var(--s-4) 0 var(--s-2); font-size: var(--text-md); }
.notes :deep(:first-child) { margin-top: 0; }
.notes :deep(code) { font-family: var(--font-code); font-size: 0.9em; background: var(--sunken); padding: 1px 4px; border-radius: var(--r-sm); }
.notes-input { font-family: var(--font-code); font-size: var(--text-sm); line-height: 1.6; }
@media (max-width: 900px) {
  .story-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 720px) {
  .hero { gap: var(--s-3) var(--s-4); }
  .portrait { justify-items: start; width: auto; }
  .portrait-error { text-align: left; }
  .ident h1 { font-size: var(--text-xl); }
  .details-row { grid-template-columns: 1fr; }
  .p-link { grid-template-columns: 30px 1fr; gap: var(--s-2); padding: var(--s-3); }
  .cited { grid-column: 2; justify-self: start; margin-top: 0; }
}
</style>
