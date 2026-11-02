<script setup lang="ts">
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import type { SimulationNodeDatum } from 'd3-force'

// Relationship map of accepted canon. One node per entity a fact links to another, coloured by its page's type and pulled
// towards its type's cluster (d3-force: links, repulsion, collision). One edge per entity pair: solid when a relationship
// fact links them, thin otherwise. Select an entity to see its neighbourhood and the facts behind each link.
// Labels are placed greedily by importance and skipped where they would overlap; zooming in makes room for more.
type Fact = { id: string, kind: string, subject: string, predicate: string, object: string | null, statement: string }
const props = defineProps<{ facts: Fact[], selected?: string }>()

// The one place a node gets its type's label and colour. c41 (per-project entity types) swaps the body for its useKind():
// `const t = kindOf(kind); return { key: t.key, one: t.one, label: t.many, tone: TONES[t.color], order: index of t.key in the project's types }`.
const TONES = { neutral: 'var(--muted)', accent: 'var(--accent)', good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', pencil: 'var(--pencil)' }
const BUILT_IN: Record<string, keyof typeof TONES> = { character: 'accent', location: 'good', item: 'warn', faction: 'bad', event: 'pencil', other: 'neutral' }
function typeStyle(kind: string) {
  const key = (kind in BUILT_IN ? kind : 'other') as EntityKind
  return { key, one: KIND_LABEL[key].one, label: KIND_LABEL[key].many, tone: TONES[BUILT_IN[key]!], order: ENTITY_KINDS.indexOf(key) }
}
const lookup = useEntityLookup()
const pageOf = (name: string) => lookup.value.byName.get(normName(name))

const links = computed(() => props.facts.filter(f => f.object && f.predicate !== 'travel_time'))
const allNames = computed(() => props.facts.flatMap(f => [f.subject, f.object ?? '']))
const nodes = computed(() => {
  const degree = new Map<string, number>()
  for (const f of links.value) for (const e of [f.subject, f.object!]) degree.set(e, (degree.get(e) ?? 0) + 1)
  const grow = degree.size > 40 ? 1.6 : 2.5 // big graphs get smaller hubs so the centre doesn't clot
  return [...degree].sort((a, b) => a[0].localeCompare(b[0])).map(([name, d]) => {
    const page = pageOf(name)
    return { name, degree: d, page, type: typeStyle(page?.kind ?? 'other'), r: 5 + Math.min(Math.sqrt(d), 4) * grow }
  })
})
type GNode = (typeof nodes.value)[number]
const byName = computed(() => new Map(nodes.value.map(n => [n.name, n])))
const edges = computed(() => {
  const pairs = new Map<string, { key: string, a: string, b: string, rels: Set<string>, facts: Fact[] }>()
  for (const f of links.value) {
    const [a, b] = [f.subject, f.object!].sort() as [string, string]
    const key = `${a}|${b}`
    if (!pairs.has(key)) pairs.set(key, { key, a, b, rels: new Set(), facts: [] })
    const p = pairs.get(key)!
    p.facts.push(f)
    if (f.kind === 'relationship') p.rels.add(humanizePredicate(f.predicate, allNames.value))
  }
  return [...pairs.values()].map(p => ({ ...p, label: [...p.rels].join(' / '), rel: p.rels.size > 0 }))
})
const types = computed(() => [...new Map(nodes.value.map(n => [n.type.key, n.type])).values()].sort((a, b) => a.order - b.order))

// Static layout in world units, computed once per data change (300 ticks, deterministic: d3-force seeds its own LCG).
const world = computed(() => {
  const ns = nodes.value
  const R = 30 + 22 * Math.sqrt(ns.length)
  // Links pull less as the graph grows, so each type keeps its own region instead of one tangle in the middle.
  const pull = Math.min(0.25, 6 / Math.max(1, ns.length))
  const centre = new Map<string, { x: number, y: number }>(types.value.map((t, i, all) => {
    const a = (i / all.length) * 2 * Math.PI - Math.PI / 2
    return [t.key, all.length === 1 ? { x: 0, y: 0 } : { x: R * Math.cos(a), y: R * Math.sin(a) }]
  }))
  const sim: (SimulationNodeDatum & { id: string, r: number, t: string })[] = ns.map(n => ({ id: n.name, r: n.r, t: n.type.key }))
  forceSimulation(sim)
    .force('link', forceLink<typeof sim[number], { source: string, target: string }>(edges.value.map(e => ({ source: e.a, target: e.b }))).id(d => d.id).distance(46).strength(pull))
    .force('charge', forceManyBody().strength(-200).distanceMax(400))
    .force('collide', forceCollide<typeof sim[number]>(d => d.r + 10))
    .force('x', forceX<typeof sim[number]>(d => centre.get(d.t)!.x).strength(0.12))
    .force('y', forceY<typeof sim[number]>(d => centre.get(d.t)!.y).strength(0.12))
    .stop()
    .tick(300)
  return new Map(sim.map(d => [d.id, { x: d.x!, y: d.y! }]))
})

// View: screen = world * k + (x, y). Node and text sizes stay in screen pixels, so zooming in spreads nodes and frees room.
const box = ref<HTMLElement | null>(null)
const W = ref(760)
const H = ref(540)
const labelW = (name: string) => name.length * 6.6 + 8
const view = reactive({ k: 1, x: 380, y: 270 })
function fit() {
  const pts = [...world.value.values()]
  if (!pts.length) return
  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  // Room on the right for the longest label, so the outermost names fit too.
  const right = 30 + Math.min(W.value * 0.2, Math.max(...nodes.value.map(n => labelW(n.name))))
  const k = Math.min(3, (W.value - 30 - right) / Math.max(1, x1 - x0), (H.value - 60) / Math.max(1, y1 - y0))
  Object.assign(view, { k, x: 30 - x0 * k + (W.value - 30 - right - (x1 - x0) * k) / 2, y: H.value / 2 - ((y0 + y1) / 2) * k })
}
onMounted(() => {
  const ro = new ResizeObserver(([e]) => {
    W.value = Math.max(260, Math.floor(e!.contentRect.width))
    H.value = W.value < 560 ? 460 : 540
    fit()
  })
  ro.observe(box.value!)
  onBeforeUnmount(() => ro.disconnect())
})
watch(world, fit)
function zoom(f: number, cx = W.value / 2, cy = H.value / 2) {
  const k = Math.min(8, Math.max(0.15, view.k * f))
  view.x = cx - (cx - view.x) * (k / view.k)
  view.y = cy - (cy - view.y) * (k / view.k)
  view.k = k
}
function panTo(name: string) {
  const p = world.value.get(name)
  if (p && (screen(p).x < 40 || screen(p).x > W.value - 40 || screen(p).y < 40 || screen(p).y > H.value - 40)) {
    view.x = W.value / 2 - p.x * view.k
    view.y = H.value / 2 - p.y * view.k
  }
}
const screen = (p: { x: number, y: number }) => ({ x: p.x * view.k + view.x, y: p.y * view.k + view.y })

// Focus: the selected entity and its neighbours stay lit; everything else dims. Hover previews the same without selecting.
const focus = ref<string | null>(props.selected && byName.value.has(props.selected) ? props.selected : null)
watch(() => props.selected, (s) => { if (s && byName.value.has(s)) select(s) })
const hover = ref<string | null>(null)
const lit = computed(() => {
  const c = hover.value ?? focus.value
  if (!c) return null
  const s = new Set([c])
  for (const e of edges.value) if (e.a === c || e.b === c) s.add(e.a === c ? e.b : e.a)
  return s
})
function select(name: string | null) {
  focus.value = name === focus.value ? null : name
  if (focus.value) panTo(focus.value)
}

const placed = computed(() => {
  const pos = new Map(nodes.value.map(n => [n.name, screen(world.value.get(n.name) ?? { x: 0, y: 0 })]))
  const ns = nodes.value.map(n => ({ ...n, ...pos.get(n.name)!, dim: !!lit.value && !lit.value.has(n.name) }))
  const centre = hover.value ?? focus.value
  const es = edges.value.map(e => ({ ...e, A: pos.get(e.a)!, B: pos.get(e.b)!, dim: !!centre && e.a !== centre && e.b !== centre }))
  // Greedy labels: the focused entity and its neighbours first, then by number of links; a label that would overlap one already
  // placed (or a node) is left out. Relationship labels show when they touch the focus, or when the graph is small.
  const boxes: [number, number, number, number][] = ns.map(n => [n.x - n.r, n.y - n.r, n.x + n.r, n.y + n.r])
  const free = (b: [number, number, number, number], skip = -1) => b[0] > 0 && b[2] < W.value && b[1] > 0 && b[3] < H.value
    && !boxes.some((o, i) => i !== skip && b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])
  const order = ns.map((n, i) => i).sort((i, j) => Number(ns[i]!.dim) - Number(ns[j]!.dim) || Number(ns[j]!.name === centre) - Number(ns[i]!.name === centre) || ns[j]!.degree - ns[i]!.degree)
  // A name goes right of its node, else left of it, else nowhere (its node still has a tooltip and the side list).
  const labels = new Map<string, 'start' | 'end'>()
  for (const i of order) {
    const n = ns[i]!
    if (n.dim) continue
    const w = labelW(n.name)
    const right: [number, number, number, number] = [n.x + n.r + 3, n.y - 8, n.x + n.r + 3 + w, n.y + 8]
    const left: [number, number, number, number] = [n.x - n.r - 3 - w, n.y - 8, n.x - n.r - 3, n.y + 8]
    const side = free(right, i) ? 'start' : free(left, i) ? 'end' : n.name === centre ? 'start' : null
    if (side) { boxes.push(side === 'start' ? right : left); labels.set(n.name, side) }
  }
  // A relationship label tries the middle of its line, then a third of the way from either end.
  const edgeLabels = es.filter(e => e.rel && !e.dim && (centre ? true : edges.value.length <= 24)).flatMap((e) => {
    const w = e.label.length * 5.8 + 6
    for (const t of [0.5, 0.35, 0.65]) {
      const x = e.A.x + (e.B.x - e.A.x) * t
      const y = e.A.y + (e.B.y - e.A.y) * t
      const b: [number, number, number, number] = [x - w / 2, y - 7, x + w / 2, y + 7]
      if (free(b)) { boxes.push(b); return [{ key: e.key, x, y, label: e.label }] }
    }
    return []
  })
  return { nodes: ns, edges: es, labels, edgeLabels }
})

// Pointer: drag pans, two fingers pinch, a tap on empty space clears the focus. Ctrl/⌘ + wheel (and trackpad pinch) zooms.
const pointers = new Map<number, { x: number, y: number }>()
let moved = 0
let pinch = 0
const local = (e: PointerEvent | WheelEvent) => {
  const r = (e.currentTarget as Element).getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function down(e: PointerEvent) {
  pointers.set(e.pointerId, local(e))
  moved = 0
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y) }
}
function move(e: PointerEvent) {
  const prev = pointers.get(e.pointerId)
  if (!prev) return
  const p = local(e)
  pointers.set(e.pointerId, p)
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    const d = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    if (pinch) zoom(d / pinch, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2)
    pinch = d
    moved = 99
    return
  }
  moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)
  if (moved > 3) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    view.x += p.x - prev.x
    view.y += p.y - prev.y
  }
}
function up(e: PointerEvent) {
  pointers.delete(e.pointerId)
  pinch = 0
}
function wheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  const p = local(e)
  zoom(Math.exp(-e.deltaY * 0.01), p.x, p.y)
}
const clickNode = (name: string) => { if (moved <= 3) select(name) }
const clickBlank = () => { if (moved <= 3) focus.value = null }

// Side panel: the focused entity's links, or the best-connected entities to start from.
const focusNode = computed(() => (focus.value ? byName.value.get(focus.value) : undefined))
const neighbours = computed(() => {
  const c = focus.value
  if (!c) return []
  return edges.value.filter(e => e.a === c || e.b === c).map(e => ({ ...e, other: e.a === c ? e.b : e.a }))
    .sort((x, y) => Number(y.rel) - Number(x.rel) || y.facts.length - x.facts.length || x.other.localeCompare(y.other))
})
const hubs = computed(() => [...nodes.value].sort((a, b) => b.degree - a.degree || a.name.localeCompare(b.name)).slice(0, 8))
const find = ref('')
watch(find, (v) => {
  const n = nodes.value.find(x => normName(x.name) === normName(v))
  if (n) { focus.value = n.name; panTo(n.name); find.value = '' }
})
const summary = computed(() => `${counted(nodes.value.length, 'entity', 'entities')} linked by ${counted(links.value.length, 'canon fact')}`)
</script>

<template>
  <figure class="graph" @keydown.esc="focus = null">
    <div class="bar">
      <ul class="legend small" aria-label="Entity types">
        <li v-for="t in types" :key="t.key"><i class="dot" :style="{ background: t.tone }" />{{ t.label }}</li>
        <li><i class="l rel" />Relationship</li>
        <li><i class="l" />Other shared facts</li>
      </ul>
      <div class="tools">
        <input v-model="find" type="search" list="graph-names" placeholder="Find entity…" aria-label="Find an entity in the graph">
        <datalist id="graph-names"><option v-for="n in nodes" :key="n.name" :value="n.name" /></datalist>
        <div class="zoom" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom in" @click="zoom(1.4)">+</button>
          <button type="button" aria-label="Zoom out" @click="zoom(1 / 1.4)">−</button>
          <button type="button" @click="fit">Fit</button>
        </div>
      </div>
    </div>

    <div class="body">
      <div ref="box" class="canvas">
        <svg
          :viewBox="`0 0 ${W} ${H}`" :width="W" :height="H" role="group" :aria-label="summary"
          @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @wheel="wheel" @click="clickBlank"
        >
          <line
            v-for="e in placed.edges" :key="e.key" :x1="e.A.x" :y1="e.A.y" :x2="e.B.x" :y2="e.B.y"
            class="edge" :class="{ rel: e.rel, dim: e.dim, hot: !e.dim && (hover ?? focus) }"
          ><title>{{ e.facts.map(f => f.statement).join('\n') }}</title></line>
          <g
            v-for="n in placed.nodes" :key="n.name" class="node" :class="{ dim: n.dim, sel: n.name === focus }" :style="{ '--tone': n.type.tone }"
            tabindex="0" role="button" :aria-pressed="n.name === focus" :aria-label="`${n.name}, ${n.type.label.toLowerCase()}, ${counted(n.degree, 'link')}`"
            @click.stop="clickNode(n.name)" @keydown.enter.prevent="select(n.name)" @keydown.space.prevent="select(n.name)"
            @mouseenter="hover = n.name" @mouseleave="hover = null" @focus="hover = n.name" @blur="hover = null"
          >
            <circle :cx="n.x" :cy="n.y" :r="n.r" />
            <text v-if="placed.labels.has(n.name)" :x="placed.labels.get(n.name) === 'start' ? n.x + n.r + 4 : n.x - n.r - 4" :y="n.y" :text-anchor="placed.labels.get(n.name)" dominant-baseline="central">{{ n.name }}</text>
            <title>{{ n.name }}</title>
          </g>
          <text v-for="l in placed.edgeLabels" :key="`l${l.key}`" :x="l.x" :y="l.y" class="edge-label" text-anchor="middle" dominant-baseline="central">{{ l.label }}</text>
        </svg>
      </div>

      <aside class="side" aria-live="polite">
        <template v-if="focusNode">
          <header class="who">
            <EntityAvatar v-if="focusNode.page" :entity="focusNode.page" :size="40" />
            <div class="min">
              <h3>{{ focusNode.name }}</h3>
              <span class="small muted"><i class="dot" :style="{ background: focusNode.type.tone }" />{{ focusNode.type.one }} · {{ counted(focusNode.degree, 'linked fact') }}</span>
            </div>
          </header>
          <div class="row">
            <UiButton v-if="focusNode.page" size="sm" icon="entities" :to="`/entities/${focusNode.page.id}`">Open page</UiButton>
            <UiButton size="sm" variant="ghost" @click="focus = null">Clear</UiButton>
          </div>
          <ul class="links">
            <li v-for="e in neighbours" :key="e.key">
              <button type="button" class="to" @click="select(e.other)">
                <i class="dot" :style="{ background: byName.get(e.other)?.type.tone }" />{{ e.other }}
              </button>
              <span v-if="e.rel" class="small rel-text">{{ e.label }}</span>
              <ul class="why small muted"><li v-for="f in e.facts" :key="f.id">{{ f.statement }}</li></ul>
            </li>
          </ul>
        </template>
        <template v-else>
          <h3>Most connected</h3>
          <p class="small muted">Select an entity to see its links and the facts behind them.</p>
          <ul class="hubs">
            <li v-for="n in hubs" :key="n.name">
              <button type="button" class="to" @click="select(n.name)"><i class="dot" :style="{ background: n.type.tone }" />{{ n.name }}</button>
              <span class="faint small">{{ n.degree }}</span>
            </li>
          </ul>
        </template>
      </aside>
    </div>
    <figcaption class="small muted">{{ summary }}. Drag to move, pinch or Ctrl + scroll to zoom. Hover a line for its facts.</figcaption>
  </figure>
</template>

<style scoped>
.graph { margin: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s-3); min-width: 0; }
.bar { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); align-items: center; justify-content: space-between; }
.legend { display: flex; flex-wrap: wrap; gap: var(--s-1) var(--s-4); margin: 0; padding: 0; list-style: none; color: var(--muted); }
.legend li { display: inline-flex; align-items: center; gap: 6px; }
.dot { flex: none; display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
.legend .dot { margin: 0; }
.l { display: inline-block; width: 22px; border-top: 1px solid var(--line-strong); }
.l.rel { border-top: 2px solid var(--ink); opacity: .6; }
.tools { display: flex; gap: var(--s-2); align-items: center; }
.tools input { width: 180px; min-height: 34px; }
.zoom { display: inline-flex; border: 1px solid var(--line-strong); border-radius: var(--r-md); overflow: hidden; }
.zoom button { min-width: 36px; min-height: 34px; padding: 0 10px; border: 0; background: var(--raised); color: var(--ink); font: 600 var(--text-sm) var(--font-ui); cursor: pointer; }
.zoom button + button { border-left: 1px solid var(--line-strong); }
.zoom button:hover { background: var(--sunken); }

.body { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: var(--s-4); align-items: start; }
.canvas { min-width: 0; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); overflow: hidden; }
svg { display: block; width: 100%; height: auto; touch-action: none; cursor: grab; user-select: none; }
svg:active { cursor: grabbing; }
.edge { stroke: var(--line-strong); stroke-width: 1; }
.edge.rel { stroke: var(--ink); stroke-opacity: .45; stroke-width: 1.75; }
.edge.hot { stroke: var(--ink); stroke-opacity: .8; }
.edge.dim { stroke-opacity: .12; }
.node { cursor: pointer; outline: none; }
.node circle { fill: var(--tone); stroke: var(--surface); stroke-width: 1.5; }
.node.sel circle, .node:focus-visible circle { stroke: var(--ink); stroke-width: 3; }
.node.dim { opacity: .18; }
.node text, .edge-label { font: 600 12px var(--font-ui); fill: var(--ink); paint-order: stroke; stroke: var(--surface); stroke-width: 4px; stroke-linejoin: round; pointer-events: none; }
.edge-label { font-weight: 500; font-size: 11px; fill: var(--muted); }

.side { display: grid; gap: var(--s-3); align-content: start; min-width: 0; max-height: 540px; overflow-y: auto; }
.side h3 { margin: 0; font-size: var(--text-base); }
.who { display: flex; gap: var(--s-3); align-items: center; }
.min { min-width: 0; display: grid; gap: 2px; }
.who h3 { overflow-wrap: anywhere; }
.links, .hubs, .why { list-style: none; margin: 0; padding: 0; }
.links { display: grid; gap: var(--s-3); border-top: 1px solid var(--line); padding-top: var(--s-3); }
.links > li { display: grid; gap: 2px; }
.hubs { display: grid; gap: 2px; }
.hubs li { display: flex; justify-content: space-between; align-items: center; gap: var(--s-2); }
.to { display: inline-flex; align-items: center; min-height: 30px; padding: 0; border: 0; background: none; color: var(--ink); font: 600 var(--text-sm) var(--font-ui); text-align: left; cursor: pointer; }
.to:hover { color: var(--accent); text-decoration: underline; }
.rel-text { color: var(--muted); font-weight: 500; }
.why { display: grid; gap: 2px; font-family: var(--font-story); }

@media (max-width: 900px) {
  .body { grid-template-columns: minmax(0, 1fr); }
  .side { max-height: none; }
}
@media (max-width: 720px) {
  .tools { width: 100%; }
  .tools input { flex: 1; min-width: 0; min-height: 44px; width: auto; }
  .zoom button { min-width: 44px; min-height: 44px; }
  .to { min-height: 44px; }
}
</style>
