<script setup lang="ts">
// Circle layout of canon entities. One edge per entity pair: solid ink + label when a relationship fact links them,
// thin dashed otherwise. Hovering or focusing an entity dims everything not connected to it.
const props = defineProps<{ facts: { id: string, kind: string, subject: string, predicate: string, object: string | null, statement: string }[], selected?: string }>()
const emit = defineEmits<{ select: [entity: string] }>()

// Layout adapts to the container: on a phone the circle becomes a tall ellipse so every label fits without panning.
const box = ref<HTMLElement | null>(null)
const W = ref(760)
onMounted(() => {
  const ro = new ResizeObserver(([e]) => { W.value = Math.max(260, Math.floor(e!.contentRect.width)) })
  ro.observe(box.value!)
  onBeforeUnmount(() => ro.disconnect())
})
const narrow = computed(() => W.value < 560)
const LABEL_ROOM = 112 // node radius + gap + a ~11-character label
const Rx = computed(() => Math.max(36, Math.min(180, W.value / 2 - LABEL_ROOM)))
const Ry = computed(() => narrow.value ? Math.max(180, props.facts.length * 9) : 180)
const H = computed(() => Ry.value * 2 + 80)
const active = ref<string | null>(null)

const links = computed(() => props.facts.filter(f => f.object && f.predicate !== 'travel_time'))
const nodes = computed(() => {
  const degree = new Map<string, number>()
  for (const f of links.value) for (const e of [f.subject, f.object!]) degree.set(e, (degree.get(e) ?? 0) + 1)
  const names = [...degree.keys()].sort()
  return names.map((name, i) => {
    const a = (i / names.length) * 2 * Math.PI - Math.PI / 2
    const cos = Math.cos(a)
    return { name, degree: degree.get(name)!, x: W.value / 2 + Rx.value * cos, y: H.value / 2 + Ry.value * Math.sin(a), anchor: Math.abs(cos) < 0.25 ? 'middle' : cos > 0 ? 'start' : 'end', cos, sin: Math.sin(a) }
  })
})
const pos = computed(() => new Map(nodes.value.map(n => [n.name, n])))
const edges = computed(() => {
  const pairs = new Map<string, { a: string, b: string, rels: Set<string>, n: number, titles: string[] }>()
  for (const f of links.value) {
    const [a, b] = [f.subject, f.object!].sort() as [string, string]
    const key = `${a}|${b}`
    if (!pairs.has(key)) pairs.set(key, { a, b, rels: new Set(), n: 0, titles: [] })
    const p = pairs.get(key)!
    p.n++
    p.titles.push(f.statement)
    if (f.kind === 'relationship') p.rels.add(humanizePredicate(f.predicate, props.facts.flatMap(x => [x.subject, x.object ?? ''])))
  }
  return [...pairs].map(([key, p]) => {
    const A = pos.value.get(p.a)!
    const B = pos.value.get(p.b)!
    return { key, ...p, label: [...p.rels].join(' / '), rel: p.rels.size > 0, x1: A.x, y1: A.y, x2: B.x, y2: B.y, mx: A.x * 0.4 + B.x * 0.6, my: A.y * 0.4 + B.y * 0.6 }
  })
})
const on = (e: { a: string, b: string }) => !active.value || e.a === active.value || e.b === active.value
const summary = computed(() => `${nodes.value.length} entities linked by ${links.value.length} canon facts`)
</script>

<template>
  <figure class="graph">
    <div class="legend small muted">
      <span><i class="l rel" /> Relationship</span>
      <span><i class="l" /> Other shared facts</span>
      <span class="faint">Select an entity to open its profile.</span>
    </div>
    <div ref="box" class="scroll">
      <svg :viewBox="`0 0 ${W} ${H}`" :width="W" :height="H" :class="{ narrow }" role="group" :aria-label="summary">
        <g v-for="e in edges" :key="e.key" :class="{ dim: !on(e) }">
          <line :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2" :class="e.rel ? 'edge rel' : 'edge'"><title>{{ e.titles.join('\n') }}</title></line>
        </g>
        <g v-for="e in edges.filter(x => x.rel)" :key="`l${e.key}`">
          <text :x="e.mx" :y="e.my" class="edge-label" text-anchor="middle" dominant-baseline="middle">{{ e.label }}</text>
        </g>
        <g
          v-for="n in nodes" :key="n.name" class="node" :class="{ sel: n.name === selected, dim: active && active !== n.name && !edges.some(e => on(e) && (e.a === n.name || e.b === n.name)) }"
          tabindex="0" role="button" :aria-label="`${n.name}, ${n.degree} links`"
          @click="emit('select', n.name)" @keydown.enter="emit('select', n.name)" @keydown.space.prevent="emit('select', n.name)"
          @mouseenter="active = n.name" @mouseleave="active = null" @focus="active = n.name" @blur="active = null"
        >
          <circle :cx="n.x" :cy="n.y" :r="9 + Math.min(n.degree, 6) * 2" />
          <text :x="n.x + n.cos * (22 + Math.min(n.degree, 6) * 2)" :y="n.y + n.sin * (22 + Math.min(n.degree, 6) * 2) + 4" :text-anchor="n.anchor">{{ n.name }}</text>
        </g>
      </svg>
    </div>
    <figcaption class="small muted">{{ summary }}. Hover a line for the facts behind it.</figcaption>
  </figure>
</template>

<style scoped>
.graph { margin: 0; display: grid; gap: var(--s-3); min-width: 0; }
.legend { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); align-items: center; }
.l { display: inline-block; width: 24px; vertical-align: middle; margin-right: 6px; border-top: 1.5px dashed var(--line-strong); }
.l.rel { border-top: 3px solid var(--accent); }
.scroll { overflow-x: auto; max-width: 100%; }
svg { max-width: 100%; height: auto; display: block; }
.narrow .edge-label { font-size: 11px; }
.edge { stroke: var(--muted); stroke-width: 1.5; stroke-dasharray: 4 4; }
.edge.rel { stroke: var(--accent); stroke-width: 3; stroke-dasharray: none; }
.edge-label { fill: var(--accent); font: 600 12px var(--font-ui); paint-order: stroke; stroke: var(--raised); stroke-width: 6px; stroke-linejoin: round; }
.node { cursor: pointer; }
.node circle { fill: color-mix(in srgb, var(--accent) 30%, var(--raised)); stroke: var(--accent); stroke-width: 2; }
.node:hover circle, .node:focus-visible circle, .node.sel circle { fill: var(--accent); }
.node:focus-visible { outline: none; }
.node:focus-visible circle { stroke: var(--ink); stroke-width: 3; }
.node text { fill: var(--ink); font: 600 13px var(--font-ui); paint-order: stroke; stroke: var(--raised); stroke-width: 4px; stroke-linejoin: round; }
g.dim .edge, .node.dim circle { opacity: .2; } /* decorations only; label text stays full contrast */
</style>
