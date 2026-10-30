<script setup lang="ts">
// Circle layout of canon entities; an edge per fact linking two entities. Relationship facts are drawn solid and labeled.
const props = defineProps<{ facts: { id: string, kind: string, subject: string, predicate: string, object: string | null, statement: string }[] }>()
const emit = defineEmits<{ select: [entity: string] }>()

const W = 640
const H = 460
const R = 175

const links = computed(() => props.facts.filter(f => f.object && f.predicate !== 'travel_time'))
const nodes = computed(() => {
  const degree = new Map<string, number>()
  for (const f of links.value) for (const e of [f.subject, f.object!]) degree.set(e, (degree.get(e) ?? 0) + 1)
  const names = [...degree.keys()].sort()
  return names.map((name, i) => {
    const a = (i / names.length) * 2 * Math.PI - Math.PI / 2
    return { name, degree: degree.get(name)!, x: W / 2 + R * Math.cos(a), y: H / 2 + R * Math.sin(a) }
  })
})
const pos = computed(() => new Map(nodes.value.map(n => [n.name, n])))
const edges = computed(() => links.value.map((f) => {
  const a = pos.value.get(f.subject)!
  const b = pos.value.get(f.object!)!
  return { ...f, x1: a.x, y1: a.y, x2: b.x, y2: b.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
}))
const summary = computed(() => `${nodes.value.length} entities linked by ${edges.value.length} canon facts`)
</script>

<template>
  <figure class="graph" style="margin: 0">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="summary">
      <g v-for="e in edges" :key="e.id">
        <line :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2" :class="e.kind === 'relationship' ? 'edge rel' : 'edge'"><title>{{ e.statement }}</title></line>
        <text v-if="e.kind === 'relationship'" :x="e.mx" :y="e.my - 4" class="edge-label" text-anchor="middle">{{ e.predicate.replace('_', ' ') }}</text>
      </g>
      <g v-for="n in nodes" :key="n.name" class="node" tabindex="0" role="button" :aria-label="`${n.name}, ${n.degree} links`" @click="emit('select', n.name)" @keydown.enter="emit('select', n.name)">
        <circle :cx="n.x" :cy="n.y" :r="10 + Math.min(n.degree, 6) * 2" />
        <text :x="n.x" :y="n.y + (n.y > H / 2 ? 34 : -22)" text-anchor="middle">{{ n.name }}</text>
      </g>
    </svg>
    <figcaption class="small muted">{{ summary }}. Solid lines are relationships; hover a line for the fact, click an entity to see its facts.</figcaption>
  </figure>
</template>

<style scoped>
.graph svg { width: 100%; height: auto; max-height: 520px; display: block; }
.edge { stroke: var(--line); stroke-width: 1.5; stroke-dasharray: 4 4; }
.edge.rel { stroke: var(--accent); stroke-width: 2.5; stroke-dasharray: none; }
.edge-label { fill: var(--accent); font: 600 11px var(--sans); paint-order: stroke; stroke: var(--surface); stroke-width: 4px; }
.node { cursor: pointer; }
.node circle { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 2; }
.node:hover circle, .node:focus-visible circle { fill: var(--accent); }
.node:focus-visible { outline: none; }
.node text { fill: var(--ink); font: 600 13px var(--sans); paint-order: stroke; stroke: var(--surface); stroke-width: 4px; }
/* The SVG scales down on phones; scale the text back up so it stays readable. */
@media (max-width: 720px) {
  .node text { font-size: 22px; }
  .edge-label { font-size: 18px; }
}
</style>
