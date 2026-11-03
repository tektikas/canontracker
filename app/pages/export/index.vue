<script setup lang="ts">
// Export the story bible (Markdown, or PDF through the print view), as a book (PDF, EPUB) or the manuscript, and manage read-only share links.
// Everyone in the project may export (it holds only canon they can already read); editors and up create and revoke links.
useHead({ title: 'Export & share · CanonTracker' })
const me = useMe()
const editor = computed(() => canEdit(me.value))
const kindLabel = useKind()
const origin = useRequestURL().origin
const { data: entities } = await useEntityList()
const { data: lib } = await useFetch('/api/library', { default: () => ({ folders: [] as { id: string, name: string, parent_id: string | null }[] }) })
const { data: shares, refresh: refreshShares } = await useFetch('/api/shares', { default: () => [] })

// What goes in. Kept in the URL so a set-up export can be linked or reloaded.
const route = useRoute()
const router = useRouter()
const q = (k: string) => (typeof route.query[k] === 'string' ? route.query[k] as string : '')
const scope = ref<BibleScope>((['project', 'entities', 'folder'] as const).find(s => s === q('scope')) ?? 'project')
const picked = ref<string[]>(q('entities') ? q('entities').split(',') : [])
const folder = ref(q('folder'))
const sections = ref<BibleSection[]>(q('sections') ? SECTION_KEYS.filter(k => q('sections').split(',').includes(k)) : [...DEFAULT_SECTIONS])
const images = ref(route.query.images !== '0')
// Layout: the report (default), the bible as a book, or the manuscript (source documents in reading order) as a book.
const book = ref<'' | BibleBook>(route.query.book === 'bible' || route.query.book === 'manuscript' ? route.query.book : '')
const manuscript = computed(() => book.value === 'manuscript')
const FORMATS: { value: '' | BibleBook, label: string, hint: string }[] = [
  { value: '', label: 'Report', hint: 'Facts with their source quotes, for reading on screen or sharing a link.' },
  { value: 'bible', label: 'Story bible as a book', hint: 'Cover, contents, a chapter per kind of entity, citations as notes. PDF or EPUB.' },
  { value: 'manuscript', label: 'Manuscript', hint: 'Your source documents, latest versions, in reading order as one book. PDF or EPUB.' },
]
watch(manuscript, (m) => { if (m && scope.value === 'entities') scope.value = 'project' })

const folders = computed(() => {
  const all = lib.value.folders
  const name = (f: { name: string, parent_id: string | null }) => {
    const p = f.parent_id && all.find(x => x.id === f.parent_id)
    return p ? `${p.name} / ${f.name}` : f.name
  }
  return all.map(f => ({ id: f.id, label: name(f) })).sort((a, b) => a.label.localeCompare(b.label))
})
const missing = computed(() => (!manuscript.value && !sections.value.length ? 'Pick at least one section.'
  : scope.value === 'entities' && !picked.value.length ? 'Pick at least one entity.'
    : scope.value === 'folder' && !folder.value ? (folders.value.length ? 'Pick a folder.' : 'This project has no folders yet. Make one in the Library.') : ''))
const query = computed(() => ({
  scope: scope.value,
  entities: scope.value === 'entities' ? picked.value.join(',') : undefined,
  folder: scope.value === 'folder' ? folder.value : undefined,
  sections: manuscript.value ? undefined : SECTION_KEYS.filter(k => sections.value.includes(k)).join(','),
  images: manuscript.value ? undefined : images.value ? '1' : '0',
  book: book.value || undefined,
}))
watch(query, v => router.replace({ query: Object.fromEntries(Object.entries(v).filter(([, x]) => x)) }))
const qs = computed(() => new URLSearchParams(Object.entries(query.value).filter(([, v]) => v) as [string, string][]).toString())

// Live preview of what the export holds (no audit: only downloads and the print view are logged).
const preview = ref<Bible | Manuscript | null>(null)
const previewBible = computed(() => (preview.value && 'entities' in preview.value ? preview.value : null))
const previewMs = computed(() => (preview.value && 'chapters' in preview.value ? preview.value : null))
const previewError = ref('')
let seq = 0
watch([qs, missing], async () => {
  const n = ++seq
  if (missing.value) return
  try {
    const b = await $fetch<Bible | Manuscript>(`/api/export/bible?${qs.value}&format=json`)
    if (n === seq) { preview.value = b; previewError.value = '' }
  } catch (e) {
    if (n === seq) previewError.value = errorMessage(e)
  }
}, { immediate: true })
const hasPortraits = computed(() => images.value && !!previewBible.value?.entities.some(e => e.portrait))
const mdHref = computed(() => `/api/export/bible?${qs.value}&format=${hasPortraits.value ? 'zip' : 'md'}`)
const epubHref = computed(() => `/api/export/bible?${qs.value}&format=epub`)
const printHref = computed(() => `/export/print?${qs.value}&print=1`)

const entityFilter = ref('')
const entityList = computed(() => {
  const s = entityFilter.value.trim().toLowerCase()
  return (entities.value ?? []).filter(e => !s || e.names.some(n => n.toLowerCase().includes(s)))
    .sort((a, b) => b.facts - a.facts || a.name.localeCompare(b.name))
})
const togglePick = (id: string) => { picked.value = picked.value.includes(id) ? picked.value.filter(x => x !== id) : [...picked.value, id] }
const toggleSection = (k: BibleSection) => { sections.value = sections.value.includes(k) ? sections.value.filter(x => x !== k) : [...sections.value, k] }
const ALL_SCOPES: { value: BibleScope, label: string }[] = [{ value: 'project', label: 'Whole project' }, { value: 'entities', label: 'Selected entities' }, { value: 'folder', label: 'One folder' }]
const SCOPES = computed(() => (manuscript.value ? ALL_SCOPES.filter(s => s.value !== 'entities') : ALL_SCOPES))

// What a link (or this set-up) shows, in one line.
const sectionList = (keys: BibleSection[]) => keys.map(k => BIBLE_SECTIONS[k].label.toLowerCase()).join(', ')
const scopeLine = (o: BibleOptions) => o.scope === 'project' ? 'Whole project'
  : o.scope === 'folder' ? `Folder ${folders.value.find(f => f.id === o.folder_id)?.label ?? '(removed)'}`
    : counted(o.entity_ids.length, 'entity', 'entities')

// Share links
type Share = typeof shares.value[number]
const active = computed(() => shares.value.filter(s => s.status === 'active'))
const inactive = computed(() => shares.value.filter(s => s.status !== 'active'))
const dialog = ref(false)
const form = reactive({ name: '', days: 30 as number | null, images: true })
const creating = ref(false)
const createError = ref('')
const created = ref<{ name: string, url: string } | null>(null)
function openCreate() {
  Object.assign(form, { name: '', days: 30, images: images.value })
  created.value = null
  createError.value = ''
  dialog.value = true
}
async function createShare() {
  createError.value = ''
  creating.value = true
  try {
    const opts = { scope: scope.value, entity_ids: picked.value, folder_id: folder.value || null, sections: sections.value, images: form.images }
    const r = await $fetch('/api/shares', { method: 'POST', body: { name: form.name, days: form.days, options: opts } })
    created.value = { name: r.name, url: `${origin}/share/${r.token}` }
    await refreshShares()
  } catch (e) {
    createError.value = errorMessage(e)
  } finally {
    creating.value = false
  }
}
const copied = ref(false)
const copyFailed = ref(false)
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    copyFailed.value = false
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    copyFailed.value = true
  }
}
const listError = ref('')
async function revoke(s: Share) {
  if (!(await askConfirm({ title: `Turn off “${s.name}”?`, body: 'Anyone who opens it sees “This link isn’t available” from now on. This can’t be undone, but you can make a new link.', confirm: 'Turn off link', danger: true }))) return
  listError.value = ''
  try {
    await $fetch(`/api/shares/${s.id}`, { method: 'DELETE' })
    await refreshShares()
  } catch (e) {
    listError.value = errorMessage(e)
  }
}
const opened = (s: Share) => (s.open_count ? `opened ${counted(s.open_count, 'time')}, last ${dateTime(s.last_opened_at!)}` : 'not opened yet')
</script>

<template>
  <UiPageHeader title="Export & share" description="Hand the story bible to writers, voice directors, localisation or a publisher. It holds only accepted canon, every fact with the exact source words it rests on." />

  <div class="layout">
    <UiPanel title="What goes in">
      <div class="setup">
        <div class="group" role="radiogroup" aria-label="Format">
          <span class="label">Format</span>
          <div class="chips">
            <label v-for="f in FORMATS" :key="f.value" class="pick" :class="{ on: book === f.value }">
              <input v-model="book" type="radio" name="format" :value="f.value">{{ f.label }}
            </label>
          </div>
          <p class="small muted fmt-hint">{{ FORMATS.find(f => f.value === book)!.hint }}</p>
        </div>

        <div class="group" role="radiogroup" aria-label="Scope">
          <span class="label">Scope</span>
          <div class="chips">
            <label v-for="s in SCOPES" :key="s.value" class="pick" :class="{ on: scope === s.value }">
              <input v-model="scope" type="radio" name="scope" :value="s.value">{{ s.label }}
            </label>
          </div>
        </div>

        <div v-if="scope === 'entities'" class="group">
          <div class="spread">
            <span class="label">Entities <span class="faint">{{ picked.length }} selected</span></span>
            <button v-if="picked.length" type="button" class="linkish small" @click="picked = []">Clear</button>
          </div>
          <input v-model="entityFilter" type="search" placeholder="Find a character, place, item…" aria-label="Find an entity">
          <ul v-if="entityList.length" class="ent-list">
            <li v-for="e in entityList" :key="e.id">
              <label class="ent" :class="{ on: picked.includes(e.id) }">
                <input type="checkbox" :checked="picked.includes(e.id)" @change="togglePick(e.id)">
                <EntityAvatar :entity="e" :size="28" />
                <span class="ent-name">{{ e.name }}</span>
                <span class="faint small">{{ kindLabel(e.kind).one }} · {{ counted(e.facts, 'fact') }}</span>
              </label>
            </li>
          </ul>
          <p v-else class="small faint">{{ entities?.length ? `No entity matches “${entityFilter}”.` : 'No entity pages yet. They appear as canon names them.' }}</p>
        </div>

        <div v-if="scope === 'folder'" class="group">
          <UiField label="Folder" hint="Canon citing a document in this folder or its subfolders.">
            <select v-model="folder" :disabled="!folders.length">
              <option value="" disabled>{{ folders.length ? 'Choose a folder' : 'No folders yet' }}</option>
              <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.label }}</option>
            </select>
          </UiField>
        </div>

        <fieldset v-if="!manuscript" class="group">
          <legend class="label">Sections</legend>
          <div class="sections">
            <label v-for="k in SECTION_KEYS" :key="k" class="sec-opt" :class="{ on: sections.includes(k), ed: k === 'editorial' }">
              <input type="checkbox" :checked="sections.includes(k)" @change="toggleSection(k)">
              <span><span class="opt-title"><b>{{ BIBLE_SECTIONS[k].label }}</b><UiBadge v-if="k === 'editorial'" tone="pencil">Not canon</UiBadge></span><span class="small muted">{{ BIBLE_SECTIONS[k].hint }}</span></span>
            </label>
          </div>
        </fieldset>

        <label v-if="!manuscript" class="sec-opt img-opt" :class="{ on: images }">
          <input v-model="images" type="checkbox">
          <span><b>Include portraits</b><span class="small muted">Entity images, in the PDF and as an images folder with the Markdown</span></span>
        </label>
      </div>
    </UiPanel>

    <div class="side">
      <UiPanel title="Download" class="download">
        <p v-if="missing" class="notice info">{{ missing }}</p>
        <p v-else-if="previewError" class="notice bad" role="alert">{{ previewError }}</p>
        <template v-else-if="preview">
          <template v-if="previewBible">
            <dl class="counts">
              <div><dt>Canon facts</dt><dd>{{ previewBible.counts.facts }}</dd></div>
              <div><dt>Entities</dt><dd>{{ previewBible.counts.entities }}</dd></div>
              <div><dt>Sources</dt><dd>{{ previewBible.counts.documents }}</dd></div>
            </dl>
            <p v-if="previewBible.counts.sample" class="small muted">{{ counted(previewBible.counts.sample, 'fact is', 'facts are') }} sample canon and marked as such.</p>
            <p v-if="previewBible.counts.stale" class="small warn-text">{{ counted(previewBible.counts.stale, 'fact cites', 'facts cite') }} an older source version; the export says so.</p>
            <p v-if="!previewBible.counts.facts && !previewBible.counts.entities" class="small muted">Nothing in this scope yet. Accept candidates in Review to build canon.</p>
          </template>
          <template v-else-if="previewMs">
            <dl class="counts">
              <div><dt>Documents</dt><dd>{{ previewMs.counts.documents }}</dd></div>
              <div><dt>Words</dt><dd>{{ previewMs.counts.words.toLocaleString('en-GB') }}</dd></div>
            </dl>
            <p class="small muted">Latest version of each document, folder by folder, then by title. {{ previewMs.cover ? 'The cover is the first document cover you set.' : 'No document has a cover image yet, so the cover is typographic.' }}</p>
            <p v-if="!previewMs.counts.documents" class="small muted">No documents in this scope yet. Add some in the Library.</p>
          </template>
        </template>
        <div class="dl-actions">
          <a class="btn primary" :class="{ disabled: !!missing }" :href="missing ? undefined : mdHref" :aria-disabled="!!missing || undefined" download>
            <UiIcon name="file" :size="16" />Download Markdown
          </a>
          <a class="btn" :class="{ disabled: !!missing }" :href="missing ? undefined : printHref" :aria-disabled="!!missing || undefined" target="_blank" rel="noopener">
            <UiIcon name="canon" :size="16" />{{ book ? 'Book as PDF' : 'Save as PDF' }}
          </a>
          <a v-if="book" class="btn" :class="{ disabled: !!missing }" :href="missing ? undefined : epubHref" :aria-disabled="!!missing || undefined" download>
            <UiIcon name="file" :size="16" />Download EPUB
          </a>
        </div>
        <p class="small faint">Markdown: {{ hasPortraits && !manuscript ? 'a .zip with the .md file and an images folder' : 'one .md file' }}. PDF opens a print-ready page; choose “Save as PDF” in the print dialog{{ book ? ' (A4, margins: default, headers and footers off)' : '' }}.</p>
      </UiPanel>

      <UiPanel title="Read-only links" class="shares">
        <template #actions>
          <UiButton v-if="editor" size="sm" variant="primary" icon="link" :disabled="!!missing || manuscript" :title="manuscript ? 'Links share the report, not the manuscript' : undefined" @click="openCreate">Create link</UiButton>
        </template>
        <p class="small muted intro">People with a link see this bible and nothing else: no drafts, candidates, notes, team or other projects. No sign-in needed.</p>
        <p v-if="!editor" class="notice info">Editors and above can create and turn off links.</p>
        <p v-if="listError" class="notice bad" role="alert">{{ listError }}</p>
        <ul v-if="active.length" class="links">
          <li v-for="s in active" :key="s.id" class="link">
            <div class="link-main">
              <strong>{{ s.name }}</strong>
              <span class="mono faint small">{{ s.prefix }}…</span>
            </div>
            <span class="small muted">{{ scopeLine(s.options) }} · {{ s.options.images ? 'with portraits' : 'no portraits' }}</span>
            <span class="small muted">{{ s.expires_at ? `Expires ${shortDate(s.expires_at)}` : 'Never expires' }} · {{ opened(s) }}</span>
            <span class="small faint">Made by {{ s.created_by_name }}, {{ shortDate(s.created_at) }}</span>
            <div v-if="editor" class="link-actions"><UiButton size="sm" variant="ghost" @click="revoke(s)">Turn off</UiButton></div>
          </li>
        </ul>
        <p v-else class="small faint none">No active links.</p>
        <details v-if="inactive.length" class="inactive">
          <summary class="small muted">{{ inactive.length }} turned off or expired</summary>
          <ul class="links">
            <li v-for="s in inactive" :key="s.id" class="link dim">
              <div class="link-main"><strong>{{ s.name }}</strong><UiBadge :tone="s.status === 'revoked' ? 'bad' : 'warn'">{{ s.status === 'revoked' ? 'Turned off' : 'Expired' }}</UiBadge></div>
              <span class="small muted">{{ s.status === 'revoked' ? `Turned off ${dateTime(s.revoked_at!)}` : `Expired ${dateTime(s.expires_at!)}` }} · {{ opened(s) }}</span>
            </li>
          </ul>
        </details>
      </UiPanel>
    </div>
  </div>

  <UiDialog v-model:open="dialog" :title="created ? 'Link ready' : 'Create a read-only link'">
    <template v-if="!created">
      <form id="share-form" class="stack" novalidate @submit.prevent="createShare">
        <UiField label="Name" :error="createError" hint="Who it’s for, so you know which link to turn off later.">
          <input v-model="form.name" type="text" maxlength="80" placeholder="Voice director, chapter 1">
        </UiField>
        <div class="group" role="radiogroup" aria-label="Expires">
          <span class="label">Expires</span>
          <div class="chips">
            <label v-for="e in SHARE_EXPIRY" :key="e.label" class="pick" :class="{ on: form.days === e.days }">
              <input v-model="form.days" type="radio" name="days" :value="e.days">{{ e.label }}
            </label>
          </div>
        </div>
        <label class="check"><input v-model="form.images" type="checkbox"> Include portraits</label>
        <p class="small shows"><b>Shows:</b> {{ scopeLine({ scope, entity_ids: picked, folder_id: folder || null, sections, images: form.images }) }} · {{ sectionList(SECTION_KEYS.filter(k => sections.includes(k))) }}. Change this under “What goes in”.</p>
      </form>
    </template>
    <template v-else>
      <p><b>Copy “{{ created.name }}” now.</b> We keep only a fingerprint of the link, so it can’t be shown again. Lost it? Turn it off and make a new one.</p>
      <div class="link-row">
        <input :value="created.url" type="text" readonly class="mono" aria-label="Share link" @focus="($event.target as HTMLInputElement).select()">
        <UiButton :variant="copied ? 'good' : 'primary'" :icon="copied ? 'check' : 'copy'" @click="copy(created.url)">{{ copied ? 'Copied' : 'Copy link' }}</UiButton>
      </div>
      <p v-if="copyFailed" class="small field-error" role="alert">Couldn’t copy. Select the link and press Ctrl+C.</p>
    </template>
    <template #actions>
      <template v-if="!created">
        <UiButton variant="ghost" @click="dialog = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="share-form" :loading="creating" :disabled="!form.name.trim()">Create link<UiSendKey /></UiButton>
      </template>
      <template v-else>
        <a class="btn" :href="created.url" target="_blank" rel="noopener">Open link</a>
        <UiButton variant="primary" @click="dialog = false">Done</UiButton>
      </template>
    </template>
  </UiDialog>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: var(--s-5); align-items: start; }
.side { display: grid; gap: var(--s-5); }
.setup { display: grid; gap: var(--s-5); }
.group { display: grid; gap: var(--s-2); border: 0; padding: 0; margin: 0; min-width: 0; }
.label { font-weight: 500; font-size: var(--text-sm); padding: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pick { position: relative; display: inline-flex; align-items: center; min-height: 36px; padding: 0 12px; border: 1px dashed var(--line-strong); border-radius: var(--r-md); background: var(--canvas); font-size: var(--text-sm); color: var(--muted); cursor: pointer; }
.pick input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.pick:hover { color: var(--ink); }
.pick.on { border-style: solid; border-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.pick:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.ent-list { list-style: none; margin: 0; padding: 0; max-height: 300px; overflow-y: auto; border: 1px solid var(--line); border-radius: var(--r-md); }
.ent { display: flex; align-items: center; gap: var(--s-2); min-height: 44px; padding: 4px var(--s-3); cursor: pointer; border-bottom: 1px solid var(--line); }
.ent-list li:last-child .ent { border-bottom: 0; }
.ent:hover { background: var(--sunken); }
.ent.on { background: var(--accent-soft); }
.ent input, .sec-opt input, .check input { width: 16px; height: 16px; accent-color: var(--accent); flex: none; margin: 0; }
.ent-name { font-weight: 500; flex: 1; min-width: 0; overflow-wrap: anywhere; }
.sections { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
.sec-opt { display: flex; gap: var(--s-2); align-items: flex-start; padding: var(--s-2) var(--s-3); min-height: 44px; border: 1px solid var(--line); border-radius: var(--r-md); cursor: pointer; }
.sec-opt input { margin-top: 3px; }
.sec-opt > span { display: grid; gap: 1px; }
.sec-opt b { font-weight: 500; }
.opt-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.sec-opt.on { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent-soft) 45%, transparent); }
.sec-opt.ed { border-style: dashed; }
.img-opt { margin-top: calc(-1 * var(--s-2)); }
.fmt-hint { margin: 0; }
.counts { display: flex; flex-wrap: wrap; gap: var(--s-5); margin: 0 0 var(--s-3); }
.counts dt { color: var(--muted); font-size: var(--text-sm); }
.counts dd { margin: 0; font-size: var(--text-xl); font-weight: 600; font-variant-numeric: tabular-nums; }
.download p { margin: 0 0 var(--s-2); }
.warn-text { color: var(--warn); }
.dl-actions { display: flex; flex-wrap: wrap; gap: var(--s-2); margin: var(--s-3) 0 var(--s-2); }
.btn.disabled { pointer-events: none; }
.intro { margin: 0 0 var(--s-3); }
.shares .notice { margin-bottom: var(--s-3); }
.links { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.link { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px var(--s-3); padding: var(--s-3) 0; border-bottom: 1px solid var(--line); }
.link > :not(.link-actions) { grid-column: 1; }
.link-main { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.link-actions { grid-column: 2; grid-row: 1 / span 4; align-self: center; }
.link.dim { opacity: 0.8; }
.none { margin: 0; }
.inactive { margin-top: var(--s-3); }
.inactive summary { cursor: pointer; }
.check { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; color: var(--ink); font-weight: 500; cursor: pointer; }
.shows { margin: 0; padding: var(--s-2) var(--s-3); border-radius: var(--r-md); background: var(--surface); color: var(--muted); }
.shows b { color: var(--ink); font-weight: 500; }
.linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.link-row { display: flex; gap: var(--s-2); }
.link-row input { flex: 1; min-width: 0; font-size: var(--text-sm); }
@media (max-width: 1100px) {
  .layout { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .sections { grid-template-columns: 1fr; }
  .pick, .check, .linkish { min-height: 44px; }
  .link { grid-template-columns: 1fr; }
  .link-actions { grid-column: 1; grid-row: auto; }
  .link-row { flex-direction: column; }
}
</style>
