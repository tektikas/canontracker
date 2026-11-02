<script setup lang="ts">
// Every source document, at its latest version, with the labels a team files them under. Folders, tags, kind and title are
// editorial: they never touch a document's text or hash (server/api/library/organise.post.ts). Viewers read only.
useHead({ title: 'Library · Story Bible' })
const me = useMe()
const editor = computed(() => canEdit(me.value))
const route = useRoute()
const router = useRouter()
const { data: docs, refresh: refreshDocs } = await useFetch('/api/documents', { key: 'library-docs', default: () => [] })
const { data: lib, refresh: refreshLib } = await useFetch('/api/library', { default: () => ({ folders: [], tags: [], colors: [], kinds: [] }) })
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const refreshAll = () => Promise.all([refreshDocs(), refreshLib(), refreshNuxtData('stats')])

// Filters live in the URL so a filtered view can be linked and survives a reload.
const param = (k: string) => computed<string>({
  get: () => (typeof route.query[k] === 'string' ? route.query[k] as string : ''),
  set: v => router.replace({ query: { ...route.query, [k]: v || undefined } }),
})
const folderSel = param('folder') // '' all · 'none' unfiled · folder id (includes its subfolders)
const tagSel = param('tag')
const kindSel = param('kind')
const staleOnly = computed({ get: () => route.query.stale === '1', set: v => router.replace({ query: { ...route.query, stale: v ? '1' : undefined } }) })
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
watch(q, v => router.replace({ query: { ...route.query, q: v.trim() || undefined } }))
type SortKey = 'title' | 'updated' | 'citations' | 'stale'
const sort = param('sort')
const sortKey = computed<SortKey>(() => (['title', 'updated', 'citations', 'stale'].includes(sort.value) ? sort.value as SortKey : 'updated'))
const desc = computed(() => (route.query.dir ? route.query.dir === 'desc' : sortKey.value !== 'title'))
function sortBy(k: SortKey) {
  const dir = sortKey.value === k ? (desc.value ? 'asc' : 'desc') : (k === 'title' ? 'asc' : 'desc')
  router.replace({ query: { ...route.query, sort: k, dir } })
}
const ariaSort = (k: SortKey) => (sortKey.value === k ? (desc.value ? 'descending' : 'ascending') : undefined)

type Folder = { id: string, name: string, parent_id: string | null }
const folders = computed(() => lib.value.folders as Folder[])
const folderById = computed(() => new Map(folders.value.map(f => [f.id, f])))
const tops = computed(() => folders.value.filter(f => !f.parent_id))
const childrenOf = (id: string) => folders.value.filter(f => f.parent_id === id)
const folderPath = (id: string | null) => {
  const f = id ? folderById.value.get(id) : undefined
  if (!f) return ''
  const p = f.parent_id ? folderById.value.get(f.parent_id) : undefined
  return p ? `${p.name} / ${f.name}` : f.name
}
const inFolder = (docFolder: string | null, id: string) => docFolder === id || (!!docFolder && folderById.value.get(docFolder)?.parent_id === id)
const folderCount = (id: string) => docs.value.filter(d => inFolder(d.folder_id, id)).length
const tags = computed(() => lib.value.tags as { id: string, name: string, color: TagTone }[])
const tagById = computed(() => new Map(tags.value.map(t => [t.id, t])))
const tagCount = (id: string) => docs.value.filter(d => d.tags.includes(id)).length

type Doc = typeof docs.value[number]
const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  const list = docs.value.filter(d =>
    (!folderSel.value || (folderSel.value === 'none' ? !d.folder_id : inFolder(d.folder_id, folderSel.value)))
    && (!tagSel.value || d.tags.includes(tagSel.value))
    && (!kindSel.value || d.kind === kindSel.value)
    && (!staleOnly.value || d.stale_facts > 0)
    && (!s || d.title.toLowerCase().includes(s) || d.name.toLowerCase().includes(s)))
  const key: Record<SortKey, (d: Doc) => string | number> = {
    title: d => d.title.toLowerCase(), updated: d => d.imported_at, citations: d => d.canon_facts, stale: d => d.stale_facts,
  }
  const k = key[sortKey.value]
  return [...list].sort((a, b) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : a.title.localeCompare(b.title)) * (desc.value ? -1 : 1))
})
const filtered = computed(() => !!(folderSel.value || tagSel.value || kindSel.value || staleOnly.value || q.value.trim()))
function clearFilters() {
  q.value = ''
  router.replace({ query: { sort: route.query.sort, dir: route.query.dir } })
}
const versionsTotal = computed(() => docs.value.reduce((n, d) => n + d.version, 0))
const currentFolder = computed(() => (folderSel.value && folderSel.value !== 'none' && folderById.value.get(folderSel.value) ? { id: folderSel.value, label: folderPath(folderSel.value) } : null))
const viewTitle = computed(() => folderSel.value === 'none' ? 'Library root' : currentFolder.value?.label ?? 'All documents')

// Selection and bulk actions.
const selected = ref<Set<string>>(new Set())
watch(docs, () => { selected.value = new Set([...selected.value].filter(id => docs.value.some(d => d.id === id))) })
const allShown = computed(() => shown.value.length > 0 && shown.value.every(d => selected.value.has(d.id)))
function toggle(id: string) {
  const s = new Set(selected.value)
  if (!s.delete(id)) s.add(id)
  selected.value = s
}
function toggleAll() {
  selected.value = allShown.value ? new Set() : new Set(shown.value.map(d => d.id))
}
const selDocs = computed(() => docs.value.filter(d => selected.value.has(d.id)))
const status = ref('')
const actionError = ref('')
const working = ref(false)
async function organise(body: Record<string, unknown>, done: string, ids = [...selected.value]) {
  working.value = true
  actionError.value = ''
  try {
    await $fetch('/api/library/organise', { method: 'POST', body: { document_ids: ids, ...body } })
    await refreshAll()
    status.value = done
  } catch (e) {
    actionError.value = errorMessage(e)
  } finally {
    working.value = false
  }
}
const nDocs = (n = selected.value.size) => counted(n, 'document')
const moveTo = (id: string | null) => organise({ folder_id: id }, id ? `Moved ${nDocs()} to ${folderPath(id)}.` : `Took ${nDocs()} out of their folders.`)
const setKind = (k: string) => organise({ kind: k }, `Set ${nDocs()} to ${docKind(k).label.toLowerCase()}.`)
const tagState = (id: string) => {
  const n = selDocs.value.filter(d => d.tags.includes(id)).length
  return n === 0 ? 'none' : n === selDocs.value.length ? 'all' : 'some'
}
const toggleTag = (id: string) => tagState(id) === 'all'
  ? organise({ remove_tags: [id] }, `Removed “${tagById.value.get(id)?.name}” from ${nDocs()}.`)
  : organise({ add_tags: [id] }, `Tagged ${nDocs()} “${tagById.value.get(id)?.name}”.`)

// Rename in place.
const renaming = ref('')
const renameText = ref('')
async function startRename(d: Doc) {
  renaming.value = d.id
  renameText.value = d.title
  await nextTick()
  document.querySelector<HTMLInputElement>('.rename-input')?.select()
}
async function saveRename(d: Doc) {
  if (renaming.value !== d.id) return
  const t = renameText.value.trim()
  renaming.value = ''
  if (t && t !== d.title) await organise({ title: t }, `Renamed to “${t}”. The file’s text is unchanged.`, [d.id])
}

// Folders and tags.
const uploader = ref<{ pick: () => void }>()
const libError = ref('')
async function call(fn: () => Promise<unknown>) {
  libError.value = ''
  try {
    await fn()
    await refreshAll()
    return true
  } catch (e) {
    libError.value = errorMessage(e)
    return false
  }
}
// One inline editor at a time: a new folder (under a parent or at the top), a folder rename, a new tag, a tag rename.
const editing = ref<{ kind: 'folder-new' | 'folder-rename' | 'tag-new' | 'tag-rename', id?: string, parent?: string | null } | null>(null)
const editText = ref('')
const newTagTone = ref<TagTone>('accent')
async function edit(e: NonNullable<typeof editing.value>, text = '') {
  editing.value = e
  editText.value = text
  libError.value = ''
  if (e.kind === 'tag-new') newTagTone.value = TAG_TONES.find(t => !tags.value.some(x => x.color === t.value))?.value ?? 'accent'
  await nextTick()
  document.querySelector<HTMLInputElement>('.side-input')?.select()
}
let saving = false
async function saveEdit() {
  const e = editing.value
  const name = editText.value.trim()
  if (!e || saving) return
  if (!name) return (editing.value = null)
  saving = true
  const ok = await call(() => e.kind === 'folder-new' ? $fetch('/api/library/folders', { method: 'POST', body: { name, parent_id: e.parent ?? null } })
    : e.kind === 'folder-rename' ? $fetch(`/api/library/folders/${e.id}`, { method: 'PATCH', body: { name } })
      : e.kind === 'tag-new' ? $fetch('/api/library/tags', { method: 'POST', body: { name, color: newTagTone.value } })
        : $fetch(`/api/library/tags/${e.id}`, { method: 'PATCH', body: { name } }))
  saving = false
  if (ok && editing.value === e) editing.value = null
}
async function deleteFolder(f: Folder) {
  const n = folderCount(f.id)
  const to = f.parent_id ? folderPath(f.parent_id) : 'the Library root'
  if (!(await askConfirm({ title: `Delete the folder “${folderPath(f.id)}”?`, body: `${n ? `Its ${nDocs(n)} move to ${to}. ` : ''}No documents are deleted.`, confirm: 'Delete folder', danger: true }))) return
  call(() => $fetch(`/api/library/folders/${f.id}`, { method: 'DELETE' })).then((ok) => {
    if (ok && folderSel.value === f.id) folderSel.value = f.parent_id ?? ''
  })
}
async function deleteTag(t: { id: string, name: string }) {
  const n = tagCount(t.id)
  if (!(await askConfirm({ title: `Delete the tag “${t.name}”?`, body: `${n ? `It comes off ${nDocs(n)}. ` : ''}No documents are deleted.`, confirm: 'Delete tag', danger: true }))) return
  call(() => $fetch(`/api/library/tags/${t.id}`, { method: 'DELETE' })).then((ok) => {
    if (ok && tagSel.value === t.id) tagSel.value = ''
  })
}
const recolor = (id: string, color: TagTone) => call(() => $fetch(`/api/library/tags/${id}`, { method: 'PATCH', body: { color } }))
const pickFolder = (id: string) => { folderSel.value = folderSel.value === id ? '' : id }
const pickTag = (id: string) => { tagSel.value = tagSel.value === id ? '' : id }
</script>

<template>
  <div class="lib">
    <UiPageHeader title="Library">
      <template v-if="docs.length">
        {{ counted(docs.length, 'document') }}, {{ counted(versionsTotal, 'version') }}<template v-if="stats?.recheck_outdated || stats?.recheck_unchanged">, <NuxtLink to="/canon?recheck=1">{{ stats.recheck_outdated ? `${counted(stats.recheck_outdated, 'canon fact')} with outdated evidence` : `${counted(stats.recheck_unchanged, 'unchanged citation')} to confirm` }}</NuxtLink></template>.
        Sources stay read-only: folders, tags and kinds are labels on top of them.
      </template>
      <template v-else>Your team’s lore, scenes and character sheets. Sources stay read-only: folders, tags and kinds are labels on top of them.</template>
      <template v-if="editor" #actions>
        <UiButton icon="review" to="/write">Write a document</UiButton>
        <UiButton variant="primary" icon="upload" @click="uploader?.pick()">Upload files</UiButton>
      </template>
    </UiPageHeader>

    <div v-if="editor" class="up-wrap"><LibraryUpload ref="uploader" :folder="currentFolder" @uploaded="refreshAll" /></div>

    <div class="lib-grid">
      <aside class="panel side" aria-label="Folders and tags">
        <section>
          <div class="side-head">
            <h2>Folders</h2>
            <button v-if="editor" type="button" class="icon-btn sm" aria-label="New folder" title="New folder" @click="edit({ kind: 'folder-new', parent: null })"><UiIcon name="plus" :size="16" /></button>
          </div>
          <ul class="side-list" role="list">
            <li><button type="button" class="side-item" :class="{ on: !folderSel }" @click="folderSel = ''"><UiIcon name="library" :size="16" /><span class="name">All documents</span><span class="n">{{ docs.length }}</span></button></li>
            <li><button type="button" class="side-item" :class="{ on: folderSel === 'none' }" @click="pickFolder('none')"><UiIcon name="file" :size="16" /><span class="name">Library root</span><span class="n">{{ docs.filter(d => !d.folder_id).length }}</span></button></li>
            <template v-for="f in tops" :key="f.id">
              <li v-for="(x, depth) in [f, ...childrenOf(f.id)]" :key="x.id" :class="{ sub: depth > 0 }">
                <form v-if="editing?.kind === 'folder-rename' && editing.id === x.id" class="side-form" @submit.prevent="saveEdit">
                  <input v-model="editText" class="side-input" type="text" aria-label="Folder name" maxlength="60" @keydown.esc="editing = null" @blur="saveEdit">
                </form>
                <div v-else class="side-row">
                  <button type="button" class="side-item" :class="{ on: folderSel === x.id }" :aria-pressed="folderSel === x.id" @click="pickFolder(x.id)">
                    <UiIcon name="folder" :size="16" /><span class="name">{{ x.name }}</span><span class="n">{{ folderCount(x.id) }}</span>
                  </button>
                  <UiMenu v-if="editor" :label="`Folder actions for ${x.name}`" class="row-menu">
                    <template #trigger><UiIcon name="more" :size="16" /></template>
                    <template #default="{ close }">
                      <button v-if="!x.parent_id" type="button" class="menu-item" @click="close(); edit({ kind: 'folder-new', parent: x.id })"><UiIcon name="plus" :size="16" />New subfolder</button>
                      <button type="button" class="menu-item" @click="close(); edit({ kind: 'folder-rename', id: x.id }, x.name)"><UiIcon name="review" :size="16" />Rename</button>
                      <button type="button" class="menu-item danger" @click="close(); deleteFolder(x)"><UiIcon name="trash" :size="16" />Delete folder</button>
                    </template>
                  </UiMenu>
                </div>
              </li>
              <li v-if="editing?.kind === 'folder-new' && editing.parent === f.id" class="sub">
                <form class="side-form" @submit.prevent="saveEdit">
                  <input v-model="editText" class="side-input" type="text" :aria-label="`New folder in ${f.name}`" placeholder="Subfolder name" maxlength="60" @keydown.esc="editing = null" @blur="saveEdit">
                </form>
              </li>
            </template>
            <li v-if="editing?.kind === 'folder-new' && !editing.parent">
              <form class="side-form" @submit.prevent="saveEdit">
                <input v-model="editText" class="side-input" type="text" aria-label="New folder name" placeholder="Folder name" maxlength="60" @keydown.esc="editing = null" @blur="saveEdit">
              </form>
            </li>
          </ul>
          <p v-if="editor && !folders.length && editing?.kind !== 'folder-new'" class="small faint side-hint">Group documents by act, region or team. Folders go two levels deep.</p>
        </section>

        <section>
          <div class="side-head">
            <h2>Tags</h2>
            <button v-if="editor" type="button" class="icon-btn sm" aria-label="New tag" title="New tag" @click="edit({ kind: 'tag-new' })"><UiIcon name="plus" :size="16" /></button>
          </div>
          <ul class="side-list" role="list">
            <li v-for="t in tags" :key="t.id">
              <form v-if="editing?.kind === 'tag-rename' && editing.id === t.id" class="side-form" @submit.prevent="saveEdit">
                <input v-model="editText" class="side-input" type="text" aria-label="Tag name" maxlength="40" @keydown.esc="editing = null" @blur="saveEdit">
              </form>
              <div v-else class="side-row">
                <button type="button" class="side-item" :class="{ on: tagSel === t.id }" :aria-pressed="tagSel === t.id" @click="pickTag(t.id)">
                  <span class="swatch" :class="t.color" aria-hidden="true" /><span class="name">{{ t.name }}</span><span class="n">{{ tagCount(t.id) }}</span>
                </button>
                <UiMenu v-if="editor" :label="`Tag actions for ${t.name}`" class="row-menu">
                  <template #trigger><UiIcon name="more" :size="16" /></template>
                  <template #default="{ close }">
                    <button type="button" class="menu-item" @click="close(); edit({ kind: 'tag-rename', id: t.id }, t.name)"><UiIcon name="review" :size="16" />Rename</button>
                    <div class="menu-label">Colour</div>
                    <div class="swatches" role="radiogroup" :aria-label="`Colour for ${t.name}`">
                      <button v-for="c in TAG_TONES" :key="c.value" type="button" role="radio" class="swatch-btn" :aria-checked="t.color === c.value" :aria-label="c.label" :title="c.label" @click="recolor(t.id, c.value)"><span class="swatch" :class="c.value" /></button>
                    </div>
                    <hr class="menu-sep">
                    <button type="button" class="menu-item danger" @click="close(); deleteTag(t)"><UiIcon name="trash" :size="16" />Delete tag</button>
                  </template>
                </UiMenu>
              </div>
            </li>
            <li v-if="editing?.kind === 'tag-new'">
              <form class="side-form" @submit.prevent="saveEdit">
                <input v-model="editText" class="side-input" type="text" aria-label="New tag name" placeholder="Tag name" maxlength="40" @keydown.esc="editing = null">
                <div class="swatches" role="radiogroup" aria-label="Tag colour">
                  <button v-for="c in TAG_TONES" :key="c.value" type="button" role="radio" class="swatch-btn" :aria-checked="newTagTone === c.value" :aria-label="c.label" :title="c.label" @click="newTagTone = c.value"><span class="swatch" :class="c.value" /></button>
                </div>
                <div class="row">
                  <UiButton size="sm" variant="primary" type="submit">Add tag</UiButton>
                  <UiButton size="sm" variant="ghost" @click="editing = null">Cancel</UiButton>
                </div>
              </form>
            </li>
          </ul>
          <p v-if="!tags.length && editing?.kind !== 'tag-new'" class="small faint side-hint">{{ editor ? 'Tags cut across folders: “Act 1”, “Needs a pass”, “Voice recorded”.' : 'No tags yet.' }}</p>
        </section>
        <p v-if="libError" class="field-error" role="alert">{{ libError }}</p>
      </aside>

      <section class="panel flush main" :aria-label="viewTitle">
        <div class="toolbar">
          <label class="search">
            <span class="sr-only">Search titles</span>
            <UiIcon name="search" :size="16" />
            <input v-model="q" type="search" placeholder="Search titles and file names">
          </label>
          <select v-model="folderSel" class="only-sm" aria-label="Folder">
            <option value="">All folders</option>
            <option value="none">Library root</option>
            <template v-for="f in tops" :key="f.id">
              <option :value="f.id">{{ f.name }}</option>
              <option v-for="c in childrenOf(f.id)" :key="c.id" :value="c.id">{{ f.name }} / {{ c.name }}</option>
            </template>
          </select>
          <select v-model="kindSel" aria-label="Kind">
            <option value="">All kinds</option>
            <option v-for="k in DOC_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
          </select>
          <select v-if="tags.length" v-model="tagSel" class="only-sm" aria-label="Tag">
            <option value="">All tags</option>
            <option v-for="t in tags" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <label class="check"><input v-model="staleOnly" type="checkbox">To re-check only</label>
        </div>

        <div v-if="editor && selected.size" class="selbar" role="region" aria-label="Selected documents">
          <b>{{ selected.size }} selected</b>
          <UiMenu label="Move to folder" class="bar-menu">
            <template #trigger><UiIcon name="folder" :size="16" />Move to</template>
            <template #default="{ close }">
              <button type="button" class="menu-item" @click="close(); moveTo(null)"><UiIcon name="file" :size="16" />Library root</button>
              <template v-for="f in tops" :key="f.id">
                <button type="button" class="menu-item" @click="close(); moveTo(f.id)"><UiIcon name="folder" :size="16" />{{ f.name }}</button>
                <button v-for="c in childrenOf(f.id)" :key="c.id" type="button" class="menu-item indent" @click="close(); moveTo(c.id)"><UiIcon name="folder" :size="16" />{{ c.name }}</button>
              </template>
              <p v-if="!folders.length" class="menu-label">No folders yet. Add one on the left.</p>
            </template>
          </UiMenu>
          <UiMenu label="Tag" class="bar-menu">
            <template #trigger><UiIcon name="tag" :size="16" />Tag</template>
            <template #default>
              <button v-for="t in tags" :key="t.id" type="button" class="menu-item" role="menuitemcheckbox" :aria-checked="tagState(t.id) === 'all' ? 'true' : tagState(t.id) === 'some' ? 'mixed' : 'false'" @click="toggleTag(t.id)">
                <UiIcon :name="tagState(t.id) === 'all' ? 'checked' : 'square'" :size="16" /><span class="swatch" :class="t.color" />{{ t.name }}
                <span v-if="tagState(t.id) === 'some'" class="faint small">some</span>
              </button>
              <p v-if="!tags.length" class="menu-label">No tags yet. Add one on the left.</p>
            </template>
          </UiMenu>
          <UiMenu label="Set kind" class="bar-menu">
            <template #trigger><UiIcon name="file" :size="16" />Kind</template>
            <template #default="{ close }">
              <button v-for="k in DOC_KINDS" :key="k.value" type="button" class="menu-item" @click="close(); setKind(k.value)"><UiIcon :name="k.icon" :size="16" />{{ k.label }}</button>
            </template>
          </UiMenu>
          <UiButton size="sm" variant="ghost" @click="selected = new Set()">Clear</UiButton>
          <span v-if="working" class="spinner" aria-label="Saving" />
        </div>
        <p v-if="status && !actionError" class="small status-line" role="status"><UiIcon name="check" :size="14" />{{ status }}</p>
        <p v-if="actionError" class="field-error status-line" role="alert">{{ actionError }}</p>

        <UiEmptyState v-if="!docs.length" icon="upload" :title="editor ? 'Drop your lore here' : 'No sources yet'">
          <template v-if="editor">Drag Markdown or text files anywhere on this page, or pick them. A file with a name you already have becomes its next version.</template>
          <template v-else>An editor on your team adds lore and scenes. They show up here as soon as they do.</template>
          <template v-if="editor" #actions>
            <UiButton variant="primary" icon="upload" @click="uploader?.pick()">Upload files</UiButton>
            <UiButton icon="review" to="/write">Write a document</UiButton>
          </template>
        </UiEmptyState>
        <UiEmptyState v-else-if="!shown.length" icon="search" title="No documents match">
          {{ folderSel && !filtered ? 'This folder is empty.' : 'Nothing here fits these filters.' }}
          <template v-if="editor && currentFolder && !(tagSel || kindSel || staleOnly || q.trim())">Drop files here to add them to {{ currentFolder.label }}.</template>
          <template #actions><UiButton @click="clearFilters">Show all documents</UiButton></template>
        </UiEmptyState>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th v-if="editor" class="sel"><label class="sel-hit"><input type="checkbox" :checked="allShown" :indeterminate="selected.size > 0 && !allShown" aria-label="Select all shown" @change="toggleAll"></label></th>
                <th :aria-sort="ariaSort('title')"><button type="button" class="sort" @click="sortBy('title')">Title<UiIcon v-if="sortKey === 'title'" :name="desc ? 'down' : 'up'" :size="14" /></button></th>
                <th class="hide-sm">Folder</th>
                <th class="hide-sm" :aria-sort="ariaSort('updated')"><button type="button" class="sort" @click="sortBy('updated')">Last change<UiIcon v-if="sortKey === 'updated'" :name="desc ? 'down' : 'up'" :size="14" /></button></th>
                <th class="num hide-sm" :aria-sort="ariaSort('citations')"><button type="button" class="sort" title="Canon facts citing this document" @click="sortBy('citations')">Cited<UiIcon v-if="sortKey === 'citations'" :name="desc ? 'down' : 'up'" :size="14" /></button></th>
                <th class="num hide-sm" :aria-sort="ariaSort('stale')"><button type="button" class="sort" title="Canon facts citing an older version, not re-checked yet" @click="sortBy('stale')">Re-check<UiIcon v-if="sortKey === 'stale'" :name="desc ? 'down' : 'up'" :size="14" /></button></th>
                <th v-if="editor" class="act"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in shown" :key="d.id" :class="{ picked: selected.has(d.id) }">
                <td v-if="editor" class="sel"><label class="sel-hit"><input type="checkbox" :checked="selected.has(d.id)" :aria-label="`Select ${d.title}`" @change="toggle(d.id)"></label></td>
                <td class="title-cell">
                  <div class="title-line">
                    <span class="kind" :title="docKind(d.kind).label"><UiIcon :name="docKind(d.kind).icon" :size="16" :label="docKind(d.kind).label" /></span>
                    <form v-if="renaming === d.id" class="rename" @submit.prevent="saveRename(d)">
                      <input v-model="renameText" class="rename-input" type="text" :aria-label="`New title for ${d.title}`" maxlength="120" @keydown.esc="renaming = ''" @blur="saveRename(d)">
                    </form>
                    <NuxtLink v-else :to="`/documents/${d.id}`" class="doc-link">{{ d.title }}</NuxtLink>
                  </div>
                  <div class="sub-line">
                    <span class="mono faint">{{ d.name }}</span>
                    <span v-if="d.origin === 'written'" class="small faint">· latest saved here</span>
                    <button v-for="t in d.tags.map(id => tagById.get(id)).filter(Boolean)" :key="t!.id" type="button" class="tag-btn" :title="`Show only “${t!.name}”`" @click="pickTag(t!.id)"><UiBadge :tone="t!.color" class="tag">{{ t!.name }}</UiBadge></button>
                  </div>
                  <div class="only-sm small faint meta-sm">
                    v{{ d.version }} · {{ shortDate(d.imported_at) }}<template v-if="d.folder_id"> · {{ folderPath(d.folder_id) }}</template> · {{ d.canon_facts }} cited
                    <NuxtLink v-if="d.stale_facts" :to="`/documents/${d.id}/history`" class="warn-link">· {{ d.stale_facts }} to re-check<template v-if="d.outdated_facts"> ({{ d.outdated_facts }} outdated)</template></NuxtLink>
                  </div>
                </td>
                <td class="hide-sm folder-cell">
                  <button v-if="d.folder_id" type="button" class="folder-link" @click="folderSel = d.folder_id!">{{ folderPath(d.folder_id) }}</button>
                  <span v-else class="faint">—</span>
                </td>
                <td class="hide-sm when">
                  <span><NuxtLink v-if="d.version > 1" :to="`/documents/${d.id}/history`" class="quiet-link" :title="`See the history of ${d.title}`">v{{ d.version }}</NuxtLink><template v-else>v1</template> · {{ shortDate(d.imported_at) }}</span>
                  <span class="small faint">{{ d.origin === 'written' ? 'Written' : 'Uploaded' }}<template v-if="d.created_by_name"> by {{ d.created_by_name }}</template></span>
                </td>
                <td class="num hide-sm">{{ d.canon_facts || '—' }}</td>
                <td class="num hide-sm">
                  <NuxtLink v-if="d.stale_facts" :to="`/documents/${d.id}/history`" class="stale-link" :title="`${counted(d.stale_facts, 'canon fact')} cite an older version; ${d.outdated_facts} of them lost their quote. See what changed.`"><UiBadge :tone="d.outdated_facts ? 'bad' : 'warn'">{{ d.stale_facts }}</UiBadge></NuxtLink>
                  <span v-else class="faint">—</span>
                </td>
                <td v-if="editor" class="act">
                  <UiMenu :label="`Actions for ${d.title}`" class="row-menu" fixed>
                    <template #trigger><UiIcon name="more" :size="16" /></template>
                    <template #default="{ close }">
                      <NuxtLink :to="`/documents/${d.id}`" class="menu-item"><UiIcon name="file" :size="16" />Open</NuxtLink>
                      <NuxtLink :to="`/documents/${d.id}/history`" class="menu-item"><UiIcon name="history" :size="16" />History{{ d.version > 1 ? ` (${d.version} versions)` : '' }}</NuxtLink>
                      <NuxtLink :to="`/write?doc=${d.id}`" class="menu-item"><UiIcon name="review" :size="16" />Edit text</NuxtLink>
                      <button type="button" class="menu-item" @click="close(); startRename(d)"><UiIcon name="review" :size="16" />Rename</button>
                      <p class="menu-label">Tags</p>
                      <button v-for="t in tags" :key="t.id" type="button" class="menu-item" role="menuitemcheckbox" :aria-checked="d.tags.includes(t.id)" @click="organise(d.tags.includes(t.id) ? { remove_tags: [t.id] } : { add_tags: [t.id] }, `${d.tags.includes(t.id) ? 'Removed' : 'Added'} “${t.name}” ${d.tags.includes(t.id) ? 'from' : 'to'} “${d.title}”.`, [d.id])">
                        <UiIcon :name="d.tags.includes(t.id) ? 'checked' : 'square'" :size="16" /><span class="swatch" :class="t.color" />{{ t.name }}
                      </button>
                      <p v-if="!tags.length" class="menu-label">No tags yet. Add one on the left.</p>
                    </template>
                  </UiMenu>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="editor && docs.length" class="drop-hint small faint hide-sm"><UiIcon name="upload" :size="14" />Drop .md or .txt files anywhere on this page{{ currentFolder ? ` to add them to ${currentFolder.label}` : '' }}.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.main .table-wrap { position: relative; } /* contains the absolute .sr-only spans, which would otherwise widen the page */
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.up-wrap :deep(.uploads) { margin-bottom: var(--s-4); }
.lib-grid { display: grid; grid-template-columns: 216px minmax(0, 1fr); gap: var(--s-4); align-items: start; }
.side { display: grid; gap: var(--s-5); padding: var(--s-4) var(--s-3); position: sticky; top: var(--s-5); max-height: calc(100vh - 2 * var(--s-5)); overflow-y: auto; }
.side-head { display: flex; align-items: center; justify-content: space-between; padding: 0 6px 6px; }
.side-head h2 { margin: 0; font-size: var(--text-xs); font-weight: 600; color: var(--faint); }
.icon-btn.sm { width: 28px; height: 28px; color: var(--muted); }
.side-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
.side-list li.sub { padding-left: 18px; }
.side-row { display: flex; align-items: center; gap: 2px; }
.side-item { flex: 1; width: 100%; min-width: 0; display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 5px 8px; border: 0; border-radius: var(--r-md); background: none; color: var(--muted); font: 500 var(--text-base) var(--font-ui); text-align: left; cursor: pointer; }
.side-item svg { color: var(--faint); }
.side-item:hover { background: var(--sunken); color: var(--ink); }
.side-item.on { background: var(--accent-soft); color: var(--accent); }
.side-item.on svg { color: var(--accent); }
.side-item .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side-item .n { font-size: var(--text-xs); font-variant-numeric: tabular-nums; color: var(--faint); }
.side-form { display: grid; gap: var(--s-2); padding: 2px 0; }
.side-form input { min-height: 32px; padding: 4px 8px; }
.side-hint { margin: 6px 8px 0; }
.row-menu { flex: none; }
.row-menu :deep(.menu-trigger) { width: 30px; height: 30px; padding: 0; justify-content: center; color: var(--faint); }
.side-row .row-menu { opacity: 0; }
.side-row:hover .row-menu, .side-row:focus-within .row-menu, .row-menu:has([aria-expanded=true]) { opacity: 1; }
@media (hover: none) { .side-row .row-menu { opacity: 1; } }
.lib :deep(.menu-pop) { left: auto; right: 0; min-width: 220px; }
.side :deep(.menu-pop) { left: 0; right: auto; }
.lib :deep(.menu-item.danger) { color: var(--bad); }
.lib :deep(.menu-item.danger svg) { color: var(--bad); }
.lib :deep(.menu-item.indent) { padding-left: 30px; }
.swatches { display: flex; gap: 4px; padding: 2px 6px 6px; }
.swatch-btn { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid transparent; border-radius: var(--r-md); background: none; cursor: pointer; }
.swatch-btn:hover { background: var(--sunken); }
.swatch-btn[aria-checked=true] { border-color: var(--ink); }
.swatch { flex: none; width: 10px; height: 10px; border-radius: 3px; background: var(--accent); }
.swatch-btn .swatch { width: 14px; height: 14px; }
.swatch.good { background: var(--good); }
.swatch.warn { background: var(--warn); }
.swatch.bad { background: var(--bad); }
.swatch.pencil { background: transparent; outline: 1.5px dashed var(--pencil); outline-offset: -1.5px; }

.main { min-width: 0; }
.toolbar { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--line); }
.search { position: relative; flex: 1 1 240px; display: block; }
.search svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--faint); }
.search input { padding-left: 32px; }
.toolbar select { width: auto; flex: 0 1 auto; }
.check { display: inline-flex; flex-direction: row; align-items: center; gap: 6px; min-height: 36px; padding: 0 4px; font-weight: 500; color: var(--muted); cursor: pointer; white-space: nowrap; }
.check input { width: 16px; height: 16px; accent-color: var(--accent); }
.only-sm { display: none !important; }
.selbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); padding: var(--s-2) var(--s-4); border-bottom: 1px solid var(--line); background: var(--accent-soft); }
.selbar b { margin-right: var(--s-2); color: var(--accent); }
.bar-menu :deep(.menu-trigger) { gap: 6px; min-height: 30px; padding: 3px 10px; border: 1px solid var(--line-strong); background: var(--raised); font-size: var(--text-sm); font-weight: 500; }
.bar-menu :deep(.menu-trigger svg) { color: var(--muted); }
.selbar :deep(.menu-pop) { left: 0; right: auto; }
.status-line { display: flex; align-items: center; gap: 6px; margin: 0; padding: var(--s-2) var(--s-4); border-bottom: 1px solid var(--line); color: var(--good); }
.status-line.field-error { color: var(--bad); }

th.sel, td.sel { width: 36px; padding-right: 0; }
.sel input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--accent); cursor: pointer; }
th.act, td.act { width: 40px; padding: 6px 8px; }
.sel-hit { display: inline-grid; place-items: center; cursor: pointer; }
.sort { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.sort:hover { color: var(--ink); }
th[aria-sort] { color: var(--ink); }
th { white-space: nowrap; }
tbody tr:hover { background: color-mix(in srgb, var(--sunken) 45%, transparent); }
tbody tr.picked { background: var(--accent-soft); }
.title-cell { min-width: 220px; }
.title-line { display: flex; align-items: center; gap: 8px; }
.kind { display: inline-grid; place-items: center; width: 26px; height: 26px; flex: none; border-radius: var(--r-sm); background: var(--sunken); color: var(--muted); }
.doc-link { font-weight: 600; color: var(--ink); text-decoration: none; }
.doc-link:hover { color: var(--accent); text-decoration: underline; }
.rename { flex: 1; }
.rename input { min-height: 30px; padding: 3px 8px; }
.sub-line { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; margin: 4px 0 0 34px; }
.sub-line .mono { font-size: var(--text-xs); }
.tag { font-weight: 500; }
.tag-btn { padding: 0; border: 0; background: none; cursor: pointer; }
.tag-btn:hover .tag { text-decoration: underline; }
.meta-sm { margin: 4px 0 0 34px; }
.warn-link, .stale-link { color: var(--warn); text-decoration: none; }
.folder-cell { white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
.folder-link { padding: 0; border: 0; background: none; color: var(--muted); font: inherit; text-align: left; cursor: pointer; }
.folder-link:hover { color: var(--accent); text-decoration: underline; }
.quiet-link { color: var(--accent); }
.main td, .main th { padding-left: 10px; padding-right: 10px; }
.when { white-space: nowrap; }
.when span { display: block; }
.drop-hint { display: flex; align-items: center; gap: 6px; margin: 0; padding: var(--s-3) var(--s-5); border-top: 1px solid var(--line); }

@media (max-width: 900px) {
  .lib-grid { grid-template-columns: minmax(0, 1fr); }
  .side { order: 2; position: static; max-height: none; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
  .only-sm { display: revert !important; }
}
@media (max-width: 720px) {
  .side { grid-template-columns: minmax(0, 1fr); }
  .toolbar { padding: var(--s-3); }
  .toolbar select { flex: 1 1 40%; }
  .title-cell { min-width: 0; }
  .sub-line, .meta-sm { margin-left: 0; }
  .selbar { padding: var(--s-2) var(--s-3); }
  .icon-btn.sm { width: 44px; height: 44px; }
  .side-item, .check, .sort { min-height: 44px; }
  th.sel, td.sel { width: 44px; }
  .sel-hit { min-width: 44px; min-height: 44px; }
  .row-menu :deep(.menu-trigger) { width: 44px; height: 44px; }
  .bar-menu :deep(.menu-trigger) { min-height: 44px; }
}
</style>
