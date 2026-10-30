<script setup lang="ts">
// Everything canon links this entity to, grouped the way a writer thinks about it (family, allies, places…).
// Each line opens to the facts behind it, with their sources. Grouping is presentation only; the facts are unchanged.
type Fact = Record<string, any>
const props = defineProps<{ entity: { name: string, names: string[], facts: Fact[] }, editable?: boolean }>()
const lookup = useEntityLookup()

const GROUPS = [
  { key: 'family', label: 'Family' },
  { key: 'allies', label: 'Allies' },
  { key: 'rivals', label: 'Rivals' },
  { key: 'factions', label: 'Factions and members' },
  { key: 'people', label: 'People' },
  { key: 'places', label: 'Places' },
  { key: 'items', label: 'Items' },
  { key: 'other', label: 'Other links' },
] as const
type Group = typeof GROUPS[number]['key']

function groupOf(predicate: string, otherKind: string | undefined): Group {
  const p = predicate.toLowerCase()
  if (otherKind === 'location' || /located|kept_in|lives|born_in|travel/.test(p)) return 'places'
  if (otherKind === 'item') return 'items'
  if (otherKind === 'faction' || /member|leads|belongs|sworn|joins|commands/.test(p)) return 'factions'
  if (/sibling|brother|sister|parent|mother|father|child|son|daughter|married|spouse|engaged|betrothed|cousin|kin|wife|husband|widow/.test(p)) return 'family'
  if (/ally|friend|serves|loyal|mentor|protect|trust|helps|loves/.test(p)) return 'allies'
  if (/rival|enemy|hate|betray|oppose|fight|attack|threat|hunts/.test(p)) return 'rivals'
  if (otherKind === 'character') return 'people'
  return 'other'
}

const names = computed(() => new Set(props.entity.names.map(normName)))
const known = computed(() => props.entity.facts.flatMap(f => [f.subject, f.object]).filter(Boolean))
const groups = computed(() => {
  const rows = new Map<string, { group: Group, subject: string, object: string, label: string, mine: 'subject' | 'object', facts: Fact[] }>()
  for (const f of props.entity.facts) {
    if (!f.object) continue
    const mine = names.value.has(normName(f.subject)) ? 'subject' : 'object'
    const other = mine === 'subject' ? f.object : f.subject
    if (names.value.has(normName(other))) continue
    const key = `${normName(f.subject)}|${f.predicate}|${normName(f.object)}`
    if (!rows.has(key)) {
      const group = groupOf(f.predicate, lookup.value.byName.get(normName(other))?.kind)
      rows.set(key, { group, subject: f.subject, object: f.object, label: humanizePredicate(f.predicate, known.value), mine, facts: [] })
    }
    rows.get(key)!.facts.push(f)
  }
  return GROUPS.map(g => ({ ...g, rows: [...rows.values()].filter(r => r.group === g.key) })).filter(g => g.rows.length)
})
const page = (name: string) => lookup.value.byName.get(normName(name))
const times = (facts: Fact[]) => [...new Set(facts.map(f => f.time_label).filter(Boolean))]
</script>

<template>
  <UiEmptyState v-if="!groups.length" title="No relationships in canon yet" icon="link">
    When accepted facts link {{ entity.name }} to another character, place or item, they show up here.
  </UiEmptyState>
  <div v-else class="groups">
    <section v-for="g in groups" :key="g.key" class="group">
      <h3>{{ g.label }} <span class="faint">{{ g.rows.length }}</span></h3>
      <ul class="rows">
        <li v-for="r in g.rows" :key="`${r.subject}|${r.label}|${r.object}`">
          <details>
            <summary>
              <span class="line">
                <template v-for="side in (['subject', 'object'] as const)" :key="side">
                  <strong v-if="r.mine === side" class="me">{{ r[side] }}</strong>
                  <NuxtLink v-else-if="page(r[side])" :to="`/entities/${page(r[side])!.id}`" class="other" @click.stop>{{ r[side] }}</NuxtLink>
                  <span v-else class="other plain">{{ r[side] }}</span>
                  <span v-if="side === 'subject'" class="pred"><span aria-hidden="true">—</span> {{ r.label }} <span aria-hidden="true">—</span></span>
                </template>
              </span>
              <span class="tags">
                <UiBadge v-for="t in times(r.facts)" :key="t">{{ t }}</UiBadge>
                <span class="small faint">{{ counted(r.facts.length, 'fact') }}</span>
              </span>
            </summary>
            <div class="facts">
              <div v-for="f in r.facts" :key="f.id" class="fact">
                <FactSummary :fact="f" sources />
                <div v-if="editable"><UiButton size="sm" :to="`/changes?target=${f.id}`">Propose change…</UiButton></div>
              </div>
            </div>
          </details>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.groups { display: grid; gap: var(--s-5); }
.group h3 { margin: 0 0 var(--s-2); font-size: var(--text-sm); font-weight: 600; color: var(--muted); }
.rows { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--raised); }
.rows li + li { border-top: 1px solid var(--line); }
summary { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); align-items: center; justify-content: space-between; padding: var(--s-3) var(--s-4); cursor: pointer; list-style: none; min-height: 48px; }
summary::-webkit-details-marker { display: none; }
summary::before { content: ""; flex: none; width: 7px; height: 7px; border-right: 1.5px solid var(--faint); border-bottom: 1.5px solid var(--faint); transform: rotate(-45deg); transition: transform var(--dur-1) var(--ease); margin-right: -4px; }
details[open] > summary::before { transform: rotate(45deg); }
summary:hover { background: var(--surface); }
summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: var(--r-lg); }
.line { flex: 1 1 260px; display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: baseline; min-width: 0; }
.me { font-weight: 600; }
.other { font-weight: 600; }
.plain { color: var(--ink); }
.pred { color: var(--muted); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.facts { display: grid; gap: var(--s-3); padding: 0 var(--s-4) var(--s-4) calc(var(--s-4) + 14px); }
.fact { display: grid; gap: var(--s-2); }
.fact + .fact { padding-top: var(--s-3); border-top: 1px dashed var(--line); }
@media (prefers-reduced-motion: reduce) { summary::before { transition: none; } }
</style>
