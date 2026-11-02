<script setup lang="ts">
import type { IconName } from '~/components/ui/Icon.vue'

// ⌘K / Ctrl+K: search canon facts, entities, documents and notes, and run commands. Keyboard first (↑ ↓ Enter Esc).
// Search is GET /api/search (canon only, current project); commands are matched here. Viewers only get read commands.
interface Item { key: string, group: string, icon: IconName, title: string, sub?: string, snippet?: string, to?: string, run?: () => void | Promise<void> }
interface Hit { id: string, snippet?: string, [k: string]: any }

const open = usePaletteOpen()
const me = useMe()
const router = useRouter()
const editor = computed(() => canEdit(me.value))
const dlg = ref<HTMLDialogElement>()
const input = ref<HTMLInputElement>()
const list = ref<HTMLElement>()
const q = ref('')
const active = ref(0)
const busy = ref('')
const error = ref('')
const results = ref<{ facts: Hit[], entities: Hit[], documents: Hit[], notes: Hit[] }>({ facts: [], entities: [], documents: [], notes: [] })
const searching = ref(false)
const uid = useId()
const recent = ref<Recent[]>([])

const words = computed(() => q.value.trim().toLowerCase().split(/\s+/).filter(Boolean))
// Every typed word must be in a command's title or keywords, or (fuzzy) its letters in order in the title: "scn" finds "Scan conflicts".
const subseq = (word: string, text: string) => { let i = 0; for (const c of text) if (c === word[i]) i++; return i === word.length }
const cmdMatch = (c: { title: string, words?: string }, w: string) => `${c.title} ${c.words ?? ''}`.toLowerCase().includes(w) || (w.length > 2 && subseq(w, c.title.toLowerCase()))

interface Cmd { icon: IconName, title: string, words?: string, edit?: boolean, to?: string, run?: () => void | Promise<void>, busyKey?: string }
const NAV: [string, string, IconName][] = [
  ['/', 'Home', 'home'], ['/library', 'Library', 'library'], ['/review', 'Review', 'review'], ['/canon', 'Canon', 'canon'], ['/entities', 'Entities', 'entities'],
  ['/conflicts', 'Conflicts', 'conflicts'], ['/changes', 'Changes', 'changes'], ['/notes', 'Notes', 'note'], ['/ask', 'Ask canon', 'ask'],
  ['/metrics', 'Metrics', 'metrics'], ['/audit', 'Audit log', 'audit'], ['/settings/projects', 'Projects', 'folder'], ['/settings/team', 'Team', 'team'], ['/settings', 'Studio settings', 'settings'],
]
const commands = computed<Cmd[]>(() => {
  const cur = me.value?.current
  const all: Cmd[] = [
    { icon: 'plus', title: 'New document', words: 'write create scene lore', edit: true, to: '/write' },
    { icon: 'refresh', title: 'Scan conflicts', words: 'check canon', edit: true, busyKey: 'scan', run: scan },
    { icon: 'changes', title: 'Propose change', words: 'edit canon impact', edit: true, to: '/changes' },
    ...NAV.map(([to, label, icon]) => ({ icon, title: `Go to ${label}`, to })),
    { icon: 'lock', title: 'Open Agents & API', words: 'mcp token agent', to: '/settings/agents' },
    ...(me.value?.projects ?? []).filter(p => p.id !== cur?.project.id).map(p => ({ icon: 'folder' as IconName, title: `Switch project: ${p.name}`, busyKey: p.id, run: () => openProject(p.id) })),
    { icon: 'moon', title: 'Toggle theme', words: 'dark light mode appearance', run: () => { toggleTheme(); close() } },
  ]
  return all.filter(c => !c.edit || editor.value)
})
const matchCmds = computed(() => (words.value.length
  ? commands.value.filter(c => words.value.every(w => cmdMatch(c, w)))
  : commands.value))

const kindOf = useKind()
const items = computed<Item[]>(() => {
  const out: Item[] = []
  const cmd = (c: Cmd): Item => ({ key: `c:${c.title}`, group: 'Commands', icon: c.icon, title: c.title, to: c.to, run: c.run })
  if (!words.value.length) {
    for (const r of recent.value) out.push({ key: `r:${r.to}`, group: 'Recent', icon: r.icon as IconName, title: r.title, sub: r.sub, to: r.to })
    return [...out, ...commands.value.map(cmd)]
  }
  const r = results.value
  // Commands lead only when the query starts one of their words ("sca" → Scan conflicts); a name like "arin" puts content first.
  const cmds = matchCmds.value.slice(0, 4).map(cmd)
  const leads = matchCmds.value.some(c => c.title.toLowerCase().split(/\W+/).some(t => t.startsWith(words.value[0]!)))
  if (leads) out.push(...cmds)
  out.push(...r.entities.map(e => ({ key: `e:${e.id}`, group: 'Entities', icon: kindOf(e.kind).icon as IconName, title: e.name, sub: e.via ? `also known as ${e.via}` : kindOf(e.kind).one, snippet: e.via ? undefined : e.summary, to: `/entities/${e.id}` })))
  out.push(...r.facts.map(f => ({ key: `f:${f.id}`, group: 'Canon facts', icon: 'canon' as IconName, title: f.statement, sub: `${f.kind} · ${f.subject}`, to: `/canon#fact-${f.id}` })))
  out.push(...r.documents.map(d => ({ key: `d:${d.id}`, group: 'Documents', icon: 'file' as IconName, title: d.title, sub: d.line ? `Line ${d.line}` : undefined, snippet: d.snippet, to: `/documents/${d.id}${d.passage_id ? `#${d.passage_id}` : ''}` })))
  out.push(...r.notes.map(n => ({ key: `n:${n.id}`, group: 'Notes', icon: 'note' as IconName, title: n.snippet ?? '', sub: `On ${n.title} · ${n.status}`, to: `/documents/${n.document_id}?notes=1#${n.passage_id}` })))
  if (!leads) out.push(...cmds)
  return out
})
const groups = computed(() => {
  const g: { name: string, items: (Item & { i: number })[] }[] = []
  items.value.forEach((it, i) => {
    const last = g[g.length - 1]
    if (last?.name === it.group) last.items.push({ ...it, i })
    else g.push({ name: it.group, items: [{ ...it, i }] })
  })
  return g
})
const status = computed(() => {
  if (!words.value.length) return ''
  const n = items.value.length
  return searching.value && !n ? 'Searching…' : n ? `${n} result${n === 1 ? '' : 's'}` : 'No results'
})

// Matched words in a result are marked; plain text segments, never v-html.
function parts(text: string) {
  if (!words.value.length) return [{ t: text, hit: false }]
  const re = new RegExp(`(${words.value.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return text.split(re).map((t, i) => ({ t, hit: i % 2 === 1 })).filter(p => p.t)
}

let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
watch(q, (v) => {
  active.value = 0
  clearTimeout(timer)
  if (!v.trim()) { searching.value = false; error.value = ''; return }
  searching.value = true
  const mine = ++seq // a newer query drops any request still in flight
  timer = setTimeout(async () => {
    try {
      const r = await $fetch('/api/search', { query: { q: v } })
      if (mine !== seq) return
      results.value = r as typeof results.value
      error.value = ''
    } catch {
      if (mine === seq) error.value = 'Search failed. Try again.'
    } finally {
      if (mine === seq) searching.value = false
    }
  }, 120)
})
watch(items, () => { active.value = Math.min(active.value, Math.max(0, items.value.length - 1)) })

const close = () => { open.value = false }
async function scan() {
  await $fetch('/api/conflicts/scan', { method: 'POST' })
  await refreshNuxtData('stats')
  close()
  await navigateTo('/conflicts')
}
async function choose(it: Item) {
  error.value = ''
  if (it.to) {
    if (it.group !== 'Commands') pushRecent({ title: it.title, sub: it.sub, to: it.to, icon: it.icon })
    close()
    await navigateTo(it.to)
    // Same page, new hash (a fact on Canon, a passage in the reader): the page watches the hash itself.
  } else if (it.run) {
    busy.value = it.key
    try { await it.run() } catch (e) { error.value = errorMessage(e) } finally { busy.value = '' }
  }
}

function key(e: KeyboardEvent) {
  const n = items.value.length
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (n) active.value = (active.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const it = items.value[active.value]
    // While a search is in flight the list still shows the previous query's results: only commands are safe to run.
    if (it && !busy.value && (!searching.value || it.group === 'Commands')) choose(it)
  }
}
watch(active, async () => {
  await nextTick()
  list.value?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' })
})

watch(open, async (o) => {
  const d = dlg.value
  if (!d) return
  if (o && !d.open) {
    q.value = ''
    active.value = 0
    error.value = ''
    recent.value = readRecent()
    d.showModal()
    input.value?.focus()
  } else if (!o && d.open) d.close()
})
const backdrop = (e: MouseEvent) => { if (e.target === dlg.value) close() }
// Any navigation (links elsewhere, back button) closes it.
router.afterEach(() => { open.value = false })
function global(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value = !open.value
  }
}
onMounted(() => window.addEventListener('keydown', global))
onBeforeUnmount(() => window.removeEventListener('keydown', global))
</script>

<template>
  <dialog ref="dlg" class="palette" aria-label="Search and commands" @close="open = false" @click="backdrop">
    <div class="palette-sheet">
      <div class="palette-head">
        <UiIcon name="search" :size="18" />
        <input
          ref="input" v-model="q" type="text" role="combobox" class="palette-input" placeholder="Search canon, entities, documents, notes…" autocomplete="off" spellcheck="false" maxlength="80"
          aria-label="Search and commands" aria-autocomplete="list" aria-expanded="true" :aria-controls="`${uid}-list`"
          :aria-activedescendant="items.length ? `${uid}-o${active}` : undefined" @keydown="key"
        >
        <button type="button" class="icon-btn" aria-label="Close search" @click="close"><UiIcon name="close" :size="18" /></button>
      </div>

      <div :id="`${uid}-list`" ref="list" class="palette-list" role="listbox" aria-label="Results">
        <div v-for="g in groups" :key="g.name" role="group" :aria-labelledby="`${uid}-g-${g.name}`">
          <div :id="`${uid}-g-${g.name}`" class="palette-group" role="presentation">{{ g.name }}</div>
          <div
            v-for="it in g.items" :id="`${uid}-o${it.i}`" :key="it.key" role="option" class="palette-item"
            :aria-selected="it.i === active" :aria-busy="busy === it.key || undefined" :class="{ stale: searching && it.group !== 'Commands' }" @pointermove="active = it.i" @click="(!searching || it.group === 'Commands') && choose(it)"
          >
            <UiIcon :name="it.icon" :size="18" class="palette-icon" />
            <span class="palette-text">
              <span class="palette-title" :class="{ story: ['Canon facts', 'Notes'].includes(it.group) }"><template v-for="(p, k) in parts(it.title)" :key="k"><mark v-if="p.hit">{{ p.t }}</mark><template v-else>{{ p.t }}</template></template></span>
              <span v-if="it.snippet" class="palette-snippet"><template v-for="(p, k) in parts(it.snippet)" :key="k"><mark v-if="p.hit">{{ p.t }}</mark><template v-else>{{ p.t }}</template></template></span>
              <span v-if="it.sub" class="palette-sub">{{ it.sub }}</span>
            </span>
            <span v-if="busy === it.key" class="spinner" aria-label="Working" />
            <UiIcon v-else-if="it.group === 'Commands' && !it.run" name="arrow" :size="16" class="palette-go" />
          </div>
        </div>
        <p v-if="!items.length && words.length && !searching" class="palette-empty">
          Nothing matches “{{ q.trim() }}”. Search covers canon facts, entities, documents and notes. Candidates still in Review are not searched.
        </p>
      </div>

      <footer class="palette-foot">
        <span v-if="error" class="palette-error" role="alert">{{ error }}</span>
        <span v-else class="palette-status" role="status" aria-live="polite">{{ status }}</span>
        <span class="palette-keys"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close</span>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.palette {
  width: min(640px, calc(100vw - 32px)); height: min(560px, calc(100dvh - 96px)); max-height: none; margin: 72px auto auto; padding: 0;
  border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--raised); color: var(--ink); box-shadow: var(--elev-overlay); overflow: hidden;
}
.palette::backdrop { background: rgb(8 12 18 / 0.45); }
/* A fixed height: results come and go without the sheet resizing. */
.palette-sheet { display: flex; flex-direction: column; height: 100%; }
.palette-head { display: flex; align-items: center; gap: var(--s-2); padding: 0 var(--s-2) 0 var(--s-4); border-bottom: 1px solid var(--line); color: var(--faint); }
.palette-input { flex: 1; min-width: 0; height: 52px; border: 0; outline: 0; background: none; color: var(--ink); font: inherit; font-size: var(--text-md); }
.palette-input::placeholder { color: var(--faint); }
.palette-head:focus-within { box-shadow: inset 0 -2px 0 var(--accent); }
.palette-list { flex: 1; min-height: 0; overflow-y: auto; padding: var(--s-1) var(--s-2) var(--s-2); overscroll-behavior: contain; }
.palette-group { padding: var(--s-3) var(--s-2) var(--s-1); font-size: var(--text-xs); font-weight: 600; color: var(--faint); }
.palette-item { display: flex; align-items: flex-start; gap: var(--s-3); padding: 8px var(--s-2); border-radius: var(--r-md); cursor: pointer; }
.palette-item.stale { opacity: .55; cursor: default; }
.palette-item[aria-selected=true] { background: var(--accent-soft); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent); }
.palette-icon { margin-top: 2px; color: var(--muted); }
.palette-item[aria-selected=true] .palette-icon { color: var(--accent); }
.palette-text { display: grid; gap: 2px; flex: 1; min-width: 0; }
.palette-title { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.palette-title.story { font-family: var(--font-story); font-size: var(--text-base); }
.palette-snippet { color: var(--muted); font-size: var(--text-sm); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.palette-sub { color: var(--faint); font-size: var(--text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette-go { margin-top: 2px; color: var(--faint); }
mark { background: var(--warn-soft); color: inherit; border-radius: 2px; padding: 0 1px; box-shadow: inset 0 -2px 0 var(--warn); }
.palette-empty { margin: var(--s-5) var(--s-3); color: var(--muted); }
.palette-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); min-height: 40px; padding: 0 var(--s-4); border-top: 1px solid var(--line); background: var(--surface); color: var(--faint); font-size: var(--text-xs); }
.palette-error { color: var(--bad); }
.palette-keys { display: inline-flex; align-items: center; gap: 4px; }
.palette-keys kbd { margin-left: 4px; }
@media (max-width: 720px) {
  .palette { width: 100vw; max-width: 100vw; height: 100dvh; max-height: 100dvh; margin: 0; border: 0; border-radius: 0; }
  .palette-input { height: 56px; font-size: 16px; }
  .palette-item { min-height: 48px; }
  .palette-foot { padding-bottom: env(safe-area-inset-bottom, 0px); }
  .palette-keys { display: none; }
}
</style>
