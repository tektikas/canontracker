<script setup lang="ts">
// Story timeline: a lane per subject, laid out by story time (minutes since Day 1 00:00).
// Exact times are solid ink marks; approximate ones are hatched ochre bands with faded edges.
type Fact = Record<string, any>
const props = defineProps<{ facts: Fact[] }>()

const PX_H = 11 // pixels per story hour
const PX = PX_H / 60
const FUZZ = 60 // minutes of visible fuzz around an approximate time
const selectedId = ref<string | null>(null)

const timed = computed(() => props.facts.filter(f => f.t_from != null || f.t_to != null))
const days = computed(() => {
  const max = Math.max(0, ...timed.value.map(f => Math.max(f.t_from ?? 0, f.t_to ?? 0) + FUZZ))
  return Math.max(1, Math.ceil(max / 1440))
})
const width = computed(() => days.value * 24 * PX_H)

const names = computed(() => new Set(props.facts.flatMap(f => [f.subject, f.object]).filter(Boolean)))
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
      let a = f.t_from ?? 0
      let b = f.t_to ?? a
      const range = b > a
      if (approx) {
        a = Math.max(0, a - (range ? FUZZ / 2 : FUZZ))
        b = b + (range ? FUZZ / 2 : FUZZ)
      }
      const left = a * PX
      const w = approx || range ? (b - a) * PX : 0
      const text = label(f)
      const end = left + (Math.max(w, 12)) + 8 + text.length * 6.6
      let row = rowEnds.findIndex(e => e + 6 <= left)
      if (row < 0) row = rowEnds.length
      rowEnds[row] = end
      return { f, approx, openStart, left, w, row, text }
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
const dayTicks = computed(() => Array.from({ length: days.value }, (_, i) => i + 1))
</script>

<template>
  <div class="tl">
    <div class="legend small muted">
      <span><i class="k exact" /> Exact time</span>
      <span><i class="k range" /> Exact range</span>
      <span><i class="k approx" /> Approximate (fuzzy band)</span>
      <span class="faint">Scroll sideways; select an item for its sources.</span>
    </div>
    <div class="scroller" tabindex="0" role="region" aria-label="Story timeline, scrolls sideways">
      <div class="inner" :style="{ width: `calc(var(--label-w) + ${width}px)` }">
        <div class="lane head">
          <div class="label" />
          <div class="track" :style="{ width: `${width}px` }">
            <div v-for="d in dayTicks" :key="d" class="day" :style="{ left: `${(d - 1) * 24 * PX_H}px`, width: `${24 * PX_H}px` }">
              <strong>Day {{ d }}</strong>
              <span v-for="h in [6, 12, 18]" :key="h" class="hour" :style="{ left: `${h * PX_H}px` }">{{ String(h).padStart(2, '0') }}:00</span>
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
        <UiButton size="sm" :to="`/changes?target=${selected.id}`">Propose change…</UiButton>
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
.track { position: relative; flex: none; background-image: linear-gradient(to right, var(--line-strong) 1px, transparent 1px), linear-gradient(to right, var(--line) 1px, transparent 1px); background-size: calc(24 * v-bind('PX_H') * 1px) 100%, calc(6 * v-bind('PX_H') * 1px) 100%; }
.head .track { height: 40px; background-image: none; }
.day { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--line-strong); padding: 4px 6px; font-size: var(--text-xs); }
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
