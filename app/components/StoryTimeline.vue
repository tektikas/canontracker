<script setup lang="ts">
// Story timeline: a lane per subject, laid out by story time (minutes since Day 1 00:00).
// Exact times are solid ink marks; approximate ones are hatched ochre bands with faded edges.
// Reading order: novels rarely say "Day 3", so the same lanes can run along the documents in the manuscript's reading order
// instead, each fact at the first document that cites it with a verified quote. That is where it is told, not when it happens.
type Fact = Record<string, any>
type Ev = Record<string, any>
// allFacts: the unfiltered canon, so a filtered view still knows every name (verbs read right: "uses X on Arin").
const props = defineProps<{ facts: Fact[], allFacts?: Fact[] }>()
const editor = computed(() => canEdit(useMe().value))

const isTimed = (f: Fact) => f.t_from != null || f.t_to != null
const docOf = (e: Ev) => ({ key: e.document_key as string, folder: (e.document_folder ?? null) as string | null, title: e.document_title as string })
const firstCite = (f: Fact): Ev | undefined => (f.evidence ?? []).filter((e: Ev) => e.verified).sort((x: Ev, y: Ev) => byReadingOrder(docOf(x), docOf(y)))[0]
// The mode comes from the whole canon, so a search that hides every timed fact doesn't flip it.
const all = computed(() => props.allFacts ?? props.facts)
const hasTime = computed(() => all.value.some(isTimed))
const hasRead = computed(() => all.value.some(f => firstCite(f)))
type Mode = 'time' | 'read'
// Story time first, unless it would show a handful of a novel's facts (Sherlock Holmes: 3 timed of 408): then reading order.
const mode = ref<Mode>(hasTime.value && (!hasRead.value || all.value.filter(isTimed).length >= all.value.length * 0.05) ? 'time' : 'read')
const reading = computed(() => mode.value === 'read')
watch(mode, () => { scroller.value?.scrollTo({ left: 0 }) })

// Long casts stay workable: the TOP subjects with most facts get a lane until "Show all".
const TOP = 12
const showAll = ref(false)
const placed = computed(() => reading.value
  ? props.facts.flatMap((f) => { const e = firstCite(f); return e ? [{ f, doc: docOf(e) }] : [] })
  : props.facts.filter(isTimed).map(f => ({ f, doc: null })))
const laneTotals = computed(() => placed.value.reduce((m, p) => m.set(p.f.subject, (m.get(p.f.subject) ?? 0) + 1), new Map<string, number>()))
const visible = computed(() => {
  if (showAll.value || laneTotals.value.size <= TOP) return placed.value
  const top = new Set([...laneTotals.value].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([n]) => n))
  return placed.value.filter(p => top.has(p.f.subject))
})
const timed = computed(() => visible.value.filter(p => !reading.value).map(p => p.f))

// Reading order columns: the documents the shown facts are first told in, labelled without the book name the band above gives.
const COL = 188
const row = computed(() => (reading.value ? 26 : 30)) // px per stacked item; a document's facts stack tighter
const chapters = computed(() => {
  const m = new Map<string, { key: string, folder: string | null, title: string }>()
  for (const p of visible.value) if (p.doc) m.set(p.doc.key, p.doc)
  return [...m.values()].sort(byReadingOrder).map((c) => {
    const book = c.folder?.split(' / ').at(-1)
    const short = book && c.title.startsWith(book) ? c.title.slice(book.length).replace(/^[\s,:;.–—-]+/, '') : ''
    return { ...c, short: short || c.title }
  })
})
const colOf = computed(() => new Map(chapters.value.map((c, i) => [c.key, i])))
// Books: runs of chapters in one folder, as a band over their ticks.
const books = computed(() => chapters.value.reduce((out, c, i) => {
  if (out.at(-1)?.folder === c.folder) out.at(-1)!.n++
  else out.push({ folder: c.folder, from: i, n: 1 })
  return out
}, [] as { folder: string | null, from: number, n: number }[]))

// Pixels per story hour: at least 11, more when the card is wide, so a short story fills it instead of half of it.
const root = ref<HTMLElement>()
const scroller = ref<HTMLElement>()
const avail = ref(0)
let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver(() => { avail.value = (root.value?.clientWidth ?? 2) - 2 }) // the scroller's 1px borders
  ro.observe(root.value!)
})
onBeforeUnmount(() => ro?.disconnect())
const TAIL = 140 // room after the last hour for a label that starts late
// px for a collapsed run of empty days: sized to its "… 3,639 d" label
const breakW = (gap: number) => Math.max(56, gap.toLocaleString('en').length * 8 + 40)
const pxH = computed(() => Math.max(11, Math.floor(((avail.value - 84 - TAIL - breakPx.value) / (dayCols.value.length * 24)) * 10) / 10))
const FUZZ = 60 // minutes of visible fuzz around an approximate time
const selectedId = ref<string | null>(null)

// Axis columns: every day that holds a fact (plus its fuzz), D1 unless the story only starts earlier, and runs of empty days
// longer than 3 collapse into one break, so "D-3650" and "D1" can share a chart. Day index d is story day d + 1 (D0 is -1).
const cols = computed(() => {
  const set = new Set<number>()
  for (const f of timed.value) {
    for (const t of [f.t_from, f.t_to]) {
      if (t == null) continue
      for (const x of f.precision === 'approximate' ? [t - FUZZ, t, t + FUZZ] : [t]) set.add(Math.floor(x / 1440))
    }
  }
  if (![...set].some(d => d < 0)) for (let d = 0; d <= Math.max(0, ...set); d++) set.add(d) // as before: D1.. contiguous
  const sorted = [...set].sort((a, b) => a - b)
  const out: { day?: number, gap?: number }[] = []
  sorted.forEach((d, i) => {
    const prev = sorted[i - 1]
    if (prev != null && d - prev > 4) out.push({ gap: d - prev - 1 })
    else if (prev != null) for (let x = prev + 1; x < d; x++) out.push({ day: x })
    out.push({ day: d })
  })
  return out.length ? out : [{ day: 0 }]
})
const dayCols = computed(() => cols.value.filter(c => c.day != null))
const breakPx = computed(() => cols.value.reduce((n, c) => n + (c.gap != null ? breakW(c.gap) : 0), 0))
// x (px) of a story minute: the column's left edge plus the minutes into the day.
const layout = computed(() => {
  let x = 0
  const left = new Map<number, number>()
  const marks = cols.value.map((c) => {
    const m = { ...c, left: x }
    if (c.day != null) { left.set(c.day, x); x += 24 * pxH.value } else x += breakW(c.gap!)
    return m
  })
  return { marks, left, total: x }
})
function xOf(t: number) {
  const d = Math.floor(t / 1440)
  return (layout.value.left.get(d) ?? 0) + (t - d * 1440) * (pxH.value / 60)
}
// The axis, the card's width, or further when a label runs past the end: the grid fills the card and holds every label.
const width = computed(() => Math.max(reading.value ? chapters.value.length * COL : layout.value.total, avail.value - 86, ...lanes.value.flatMap(l => l.items.map(i => i.end + 8))))
// Track grid: day and 6-hour lines by story time, one line per document in reading order.
const grid = computed(() => (reading.value ? [COL, COL] : [24 * pxH.value, 6 * pxH.value]).map(n => `${n}px 100%`).join(', '))

const names = computed(() => new Set((props.allFacts ?? props.facts).flatMap(f => [f.subject, f.object]).filter(Boolean)))
function label(f: Fact) {
  if (f.predicate === 'located_at') return `at ${f.object}`
  return factPhrase(f, names.value)
}

const lanes = computed(() => {
  const bySubject = new Map<string, Fact[]>()
  const sorted = reading.value
    ? [...visible.value].sort((a, b) => colOf.value.get(a.doc!.key)! - colOf.value.get(b.doc!.key)!).map(p => p.f) // stable: canon order within a document
    : [...timed.value].sort((a, b) => (a.t_from ?? a.t_to) - (b.t_from ?? b.t_to))
  for (const f of sorted) {
    if (!bySubject.has(f.subject)) bySubject.set(f.subject, [])
    bySubject.get(f.subject)!.push(f)
  }
  if (reading.value) {
    const doc = new Map(visible.value.map(p => [p.f.id, p.doc!]))
    // Stacked within the document's column, in canon order.
    return [...bySubject].map(([name, facts]) => {
      const inCol = new Map<number, number>()
      const items = facts.map((f) => {
        const col = colOf.value.get(doc.get(f.id)!.key)!
        const row = inCol.get(col) ?? 0
        inCol.set(col, row + 1)
        const left = col * COL + 10
        const c = chapters.value[col]!
        return { f, approx: false, openStart: false, left, w: 0, row, text: label(f), end: left, aria: `${c.title}: ${f.statement}` }
      })
      return { name, items, rows: Math.max(...inCol.values()) }
    })
  }
  return [...bySubject].map(([name, facts]) => {
    const rowEnds: number[] = []
    const items = facts.map((f) => {
      const approx = f.precision === 'approximate'
      // "until X" facts have only t_to: draw from the start of the axis with a faded left edge.
      const openStart = f.t_from == null
      let a = f.t_from ?? f.t_to!
      let b = f.t_to ?? a
      const range = openStart || b > a
      if (approx) {
        a = a - (range ? FUZZ / 2 : FUZZ)
        b = b + (range ? FUZZ / 2 : FUZZ)
      }
      const left = openStart ? 0 : xOf(a)
      const w = approx || range ? xOf(b) - left : 0
      const text = label(f)
      const end = left + (Math.max(w, 12)) + 8 + text.length * 6.6
      let row = rowEnds.findIndex(e => e + 6 <= left)
      if (row < 0) row = rowEnds.length
      rowEnds[row] = end
      return { f, approx, openStart, left, w, row, text, end, aria: `${f.time_label}${approx ? ' (approximate)' : ''}: ${f.statement}` }
    })
    return { name, items, rows: rowEnds.length }
  })
})
const detailEl = ref<HTMLElement | null>(null)
function pick(id: string) {
  selectedId.value = id === selectedId.value ? null : id
  // The detail sits below the chart: bring it into view so the click visibly does something.
  if (selectedId.value) nextTick(() => detailEl.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}
const selected = computed(() => props.facts.find(f => f.id === selectedId.value) ?? null)
</script>

<template>
  <div ref="root" class="tl">
    <div v-if="(hasTime && hasRead) || laneTotals.size > TOP" class="tools">
      <div v-if="hasTime && hasRead" class="modes" role="group" aria-label="Timeline axis">
        <button type="button" class="f" :class="{ on: !reading }" :aria-pressed="!reading" @click="mode = 'time'">Story time</button>
        <button type="button" class="f" :class="{ on: reading }" :aria-pressed="reading" @click="mode = 'read'">Reading order</button>
      </div>
      <button v-if="laneTotals.size > TOP" type="button" class="f" :aria-pressed="showAll" @click="showAll = !showAll">{{ showAll ? `Show top ${TOP} lanes` : `Show all ${laneTotals.size} lanes` }}</button>
    </div>
    <div v-if="reading" class="legend small muted">
      <span><b>Reading order:</b> where each fact is told, not when it happens in the story.</span>
      <span class="faint">Each fact sits at the first chapter that cites it. Scroll sideways; select an item for its sources.</span>
    </div>
    <div v-else class="legend small muted">
      <span><i class="k exact" /> Exact time</span>
      <span><i class="k range" /> Exact range</span>
      <span><i class="k approx" /> Approximate (fuzzy band)</span>
      <span class="faint">Scroll sideways; select an item for its sources.</span>
    </div>
    <p v-if="!lanes.length" class="muted hint">{{ reading ? 'No canon fact here cites a source yet.' : 'No timed canon facts here.' }}</p>
    <div v-else ref="scroller" class="scroller" tabindex="0" role="region" :aria-label="reading ? 'Timeline in reading order, scrolls sideways' : 'Story timeline, scrolls sideways'">
      <div class="inner" :style="{ width: `calc(var(--label-w) + ${width}px)` }">
        <div class="lane head" :class="{ read: reading }">
          <div class="label" />
          <div v-if="reading" class="track" :style="{ width: `${width}px` }">
            <div v-for="b in books" :key="b.from" class="book" :style="{ left: `${b.from * COL}px`, width: `${b.n * COL}px` }" :title="b.folder ?? 'No folder'">
              <span>{{ b.folder ?? 'No folder' }}</span>
            </div>
            <div v-for="(c, i) in chapters" :key="c.key" class="day chap" :style="{ left: `${i * COL}px`, width: `${COL}px` }" :title="c.title">
              <strong>{{ c.short }}</strong>
            </div>
          </div>
          <div v-else class="track" :style="{ width: `${width}px` }">
            <div v-for="c in layout.marks" :key="c.left" class="day" :class="{ brk: c.gap }" :style="{ left: `${c.left}px`, width: `${c.gap ? breakW(c.gap) : 24 * pxH}px` }">
              <strong v-if="c.gap" :title="`${c.gap} days with nothing in them`">… {{ c.gap.toLocaleString('en') }} d</strong>
              <strong v-else>Day {{ c.day! + 1 }}</strong>
              <template v-if="!c.gap">
              <span v-for="h in [6, 12, 18]" :key="h" class="hour" :style="{ left: `${h * pxH}px` }">{{ String(h).padStart(2, '0') }}:00</span>
              </template>
            </div>
          </div>
        </div>
        <div v-for="lane in lanes" :key="lane.name" class="lane">
          <div class="label">{{ lane.name }}</div>
          <div class="track" :style="{ width: `${width}px`, minHeight: `${lane.rows * row + 14}px` }">
            <button
              v-for="it in lane.items" :key="it.f.id" type="button" class="item"
              :class="{ approx: it.approx, range: !it.approx && it.w, point: !it.approx && !it.w, sel: it.f.id === selectedId, open: it.openStart, ro: reading }"
              :style="{ left: `${it.left}px`, top: `${7 + it.row * row}px` }"
              :aria-pressed="it.f.id === selectedId"
              :aria-label="it.aria"
              :title="reading ? it.f.statement : undefined"
              @click="pick(it.f.id)"
            >
              <span class="mark" :style="it.w ? { width: `${it.w}px` } : undefined" />
              <span class="text">{{ it.text }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selected" ref="detailEl" class="detail">
      <FactSummary :fact="selected" sources />
      <div class="row">
        <UiButton v-if="editor" size="sm" :to="`/changes?target=${selected.id}`">Propose change…</UiButton>
        <UiButton size="sm" variant="ghost" @click="selectedId = null">Close</UiButton>
      </div>
    </div>
    <p v-else class="small faint hint">Select an item to see the fact and its source passage.</p>
  </div>
</template>

<style scoped>
.tl { --label-w: 108px; display: grid; gap: var(--s-3); min-width: 0; }
.legend { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); align-items: center; }
.k { display: inline-block; vertical-align: middle; margin-right: 6px; }
.k.exact { width: 9px; height: 9px; background: var(--accent); transform: rotate(45deg); }
.k.range { width: 22px; height: 8px; background: var(--accent); border-radius: 2px; }
.k.approx { width: 22px; height: 10px; border: 1px dashed var(--warn); border-radius: 2px; background: repeating-linear-gradient(135deg, var(--warn-soft) 0 3px, transparent 3px 6px); }
.scroller { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); max-width: 100%; }
.scroller:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.inner { position: relative; }
.lane { display: flex; border-top: 1px solid var(--line); }
.lane.head { border-top: 0; background: var(--surface); }
.label { position: sticky; left: 0; z-index: 3; flex: none; width: var(--label-w); padding: 10px var(--s-2); background: var(--surface); border-right: 1px solid var(--line-strong); font-size: var(--text-sm); font-weight: 600; overflow-wrap: break-word; hyphens: auto; }
.track { position: relative; flex: none; background-image: linear-gradient(to right, var(--line-strong) 1px, transparent 1px), linear-gradient(to right, var(--line) 1px, transparent 1px); background-size: v-bind(grid); }
.head .track { height: 40px; background-image: none; }
.head.read .track { height: 62px; }
.book { position: absolute; top: 0; height: 22px; padding: 3px 6px; border-left: 1px solid var(--line-strong); border-bottom: 1px solid var(--line); background: var(--sunken); color: var(--muted); font-size: var(--text-xs); font-weight: 600; }
.book span { position: sticky; left: calc(var(--label-w) + 6px); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.day.chap { top: 22px; overflow: hidden; }
.chap strong { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3; }
.day { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--line-strong); padding: 4px 6px; font-size: var(--text-xs); }
.day.brk { background: repeating-linear-gradient(135deg, var(--line) 0 2px, transparent 2px 6px); white-space: nowrap; overflow: hidden; }
.hour { position: absolute; top: 22px; transform: translateX(-50%); color: var(--faint); font-size: var(--text-xs); }
.item { position: absolute; display: flex; align-items: center; gap: 6px; height: 24px; padding: 0; border: 0; background: none; cursor: pointer; font: inherit; font-size: var(--text-sm); color: var(--ink); white-space: nowrap; border-radius: var(--r-sm); }
.item::before { content: ""; position: absolute; inset: -6px -8px; } /* transparent hit area; bar geometry stays true */
.item:hover .text, .item.sel .text { text-decoration: underline; }
.item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.item.sel { outline: 2px solid var(--ink); outline-offset: 2px; }
.mark { flex: none; height: 12px; background: var(--accent); }
.point .mark { width: 12px; transform: rotate(45deg) scale(.8); margin-right: 2px; }
.range .mark { border-radius: 2px; }
.approx .mark { height: 16px; border: 1px dashed var(--warn); border-radius: 3px; background: repeating-linear-gradient(135deg, var(--warn-soft) 0 3px, transparent 3px 6px); -webkit-mask-image: linear-gradient(to right, transparent, #000 25%, #000 75%, transparent); mask-image: linear-gradient(to right, transparent, #000 25%, #000 75%, transparent); }
.approx .text::before { content: "~ "; color: var(--warn); font-weight: 700; }
.open .mark { -webkit-mask-image: linear-gradient(to right, transparent, #000 40%); mask-image: linear-gradient(to right, transparent, #000 40%); }
.detail { display: grid; gap: var(--s-3); padding: var(--s-4); border: 1px solid var(--accent); border-radius: var(--r-md); background: var(--surface); min-width: 0; }
.hint { margin: 0; }
.ro .text { max-width: calc(v-bind(COL) * 1px - 38px); overflow: hidden; text-overflow: ellipsis; }
.tools { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.modes { display: inline-flex; }
.modes .f + .f { margin-left: -1px; }
.modes .f:first-child { border-radius: var(--r-md) 0 0 var(--r-md); }
.modes .f:last-child { border-radius: 0 var(--r-md) var(--r-md) 0; }
.f { font: inherit; font-size: var(--text-sm); color: var(--muted); background: var(--raised); border: 1px solid var(--line-strong); border-radius: var(--r-md); padding: 6px 12px; min-height: 34px; cursor: pointer; }
.f:hover { color: var(--ink); }
.f.on { position: relative; background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
@media (max-width: 720px) { .f { min-height: 44px; } }
</style>
