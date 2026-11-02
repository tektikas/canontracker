<script setup lang="ts">
// Story timeline: a lane per subject, laid out by story time (minutes since Day 1 00:00).
// Exact times are solid ink marks; approximate ones are hatched ochre bands with faded edges.
type Fact = Record<string, any>
// allFacts: the unfiltered canon, so a filtered view still knows every name (verbs read right: "uses X on Arin").
const props = defineProps<{ facts: Fact[], allFacts?: Fact[] }>()
const editor = computed(() => canEdit(useMe().value))

// Pixels per story hour: at least 11, more when the card is wide, so a short story fills it instead of half of it.
const scroller = ref<HTMLElement>()
const avail = ref(0)
let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver(() => { avail.value = scroller.value?.clientWidth ?? 0 })
  ro.observe(scroller.value!)
})
onBeforeUnmount(() => ro?.disconnect())
const TAIL = 140 // room after the last hour for a label that starts late
// px for a collapsed run of empty days: sized to its "… 3,639 d" label
const breakW = (gap: number) => Math.max(56, gap.toLocaleString('en').length * 8 + 40)
const pxH = computed(() => Math.max(11, Math.floor(((avail.value - 84 - TAIL - breakPx.value) / (dayCols.value.length * 24)) * 10) / 10))
const FUZZ = 60 // minutes of visible fuzz around an approximate time
const selectedId = ref<string | null>(null)

const timed = computed(() => props.facts.filter(f => f.t_from != null || f.t_to != null))
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
const width = computed(() => Math.max(layout.value.total, avail.value - 86, ...lanes.value.flatMap(l => l.items.map(i => i.end + 8))))

const names = computed(() => new Set((props.allFacts ?? props.facts).flatMap(f => [f.subject, f.object]).filter(Boolean)))
function label(f: Fact) {
  if (f.predicate === 'located_at') return `at ${f.object}`
  return factPhrase(f, names.value)
}

const lanes = computed(() => {
  const bySubject = new Map<string, Fact[]>()
  for (const f of [...timed.value].sort((a, b) => (a.t_from ?? a.t_to) - (b.t_from ?? b.t_to))) {
    if (!bySubject.has(f.subject)) bySubject.set(f.subject, [])
    bySubject.get(f.subject)!.push(f)
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
      return { f, approx, openStart, left, w, row, text, end }
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
const selected = computed(() => timed.value.find(f => f.id === selectedId.value) ?? null)
</script>

<template>
  <div class="tl">
    <div class="legend small muted">
      <span><i class="k exact" /> Exact time</span>
      <span><i class="k range" /> Exact range</span>
      <span><i class="k approx" /> Approximate (fuzzy band)</span>
      <span class="faint">Scroll sideways; select an item for its sources.</span>
    </div>
    <div ref="scroller" class="scroller" tabindex="0" role="region" aria-label="Story timeline, scrolls sideways">
      <div class="inner" :style="{ width: `calc(var(--label-w) + ${width}px)` }">
        <div class="lane head">
          <div class="label" />
          <div class="track" :style="{ width: `${width}px` }">
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
          <div class="track" :style="{ width: `${width}px`, height: `${lane.rows * 30 + 14}px` }">
            <button
              v-for="it in lane.items" :key="it.f.id" type="button" class="item"
              :class="{ approx: it.approx, range: !it.approx && it.w, point: !it.approx && !it.w, sel: it.f.id === selectedId, open: it.openStart }"
              :style="{ left: `${it.left}px`, top: `${7 + it.row * 30}px` }"
              :aria-pressed="it.f.id === selectedId"
              :aria-label="`${it.f.time_label}${it.approx ? ' (approximate)' : ''}: ${it.f.statement}`"
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
.tl { --label-w: 84px; display: grid; gap: var(--s-3); min-width: 0; }
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
.label { position: sticky; left: 0; z-index: 3; flex: none; width: var(--label-w); padding: 10px var(--s-2); background: var(--surface); border-right: 1px solid var(--line-strong); font-size: var(--text-sm); font-weight: 600; overflow-wrap: anywhere; }
.track { position: relative; flex: none; background-image: linear-gradient(to right, var(--line-strong) 1px, transparent 1px), linear-gradient(to right, var(--line) 1px, transparent 1px); background-size: calc(24 * v-bind(pxH) * 1px) 100%, calc(6 * v-bind(pxH) * 1px) 100%; }
.head .track { height: 40px; background-image: none; }
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
</style>
