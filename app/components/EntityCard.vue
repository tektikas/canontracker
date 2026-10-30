<script setup lang="ts">
// Profile of one entity: everything canon says about it, grouped by kind, with relationships and sources.
type Fact = Record<string, any>
const props = defineProps<{ name: string, facts: Fact[] }>()
const emit = defineEmits<{ select: [entity: string] }>()

const KINDS = ['character', 'location', 'rule', 'claim', 'event']
const mine = computed(() => props.facts.filter(f => f.subject === props.name || f.object === props.name))
const rels = computed(() => mine.value.filter(f => f.kind === 'relationship'))
const groups = computed(() => KINDS.map(kind => ({ kind, facts: mine.value.filter(f => f.kind === kind) })).filter(g => g.facts.length))
const names = computed(() => new Set(props.facts.flatMap(f => [f.subject, f.object]).filter(Boolean)))
const rel = (f: Fact) => humanizePredicate(f.predicate, names.value)
// Source documents (scenes, lore) that mention this entity, with the passages cited.
const appearances = computed(() => {
  const docs = new Map<string, { id: string, title: string, passages: Map<string, number> }>()
  for (const f of mine.value) for (const ev of f.evidence ?? []) {
    if (!docs.has(ev.document_id)) docs.set(ev.document_id, { id: ev.document_id, title: ev.document_title, passages: new Map() })
    if (ev.passage_id) docs.get(ev.document_id)!.passages.set(ev.passage_id, ev.start_line)
  }
  return [...docs.values()].sort((a, b) => a.title.localeCompare(b.title))
})
</script>

<template>
  <div class="profile">
    <header class="top">
      <h2>{{ name }}</h2>
      <UiBadge>{{ mine.length }} {{ mine.length === 1 ? 'fact' : 'facts' }}</UiBadge>
    </header>

    <UiEmptyState v-if="!mine.length" title="Nothing in canon about this yet" />

    <section v-if="rels.length" class="block">
      <h3>Relationships</h3>
      <div class="facts">
        <div v-for="f in rels" :key="f.id" class="item">
          <div class="rels">
            <template v-if="f.subject === name">
              <span class="muted">{{ rel(f) }}</span>
              <button type="button" class="link" @click="emit('select', f.object)">{{ f.object }}</button>
            </template>
            <template v-else>
              <button type="button" class="link" @click="emit('select', f.subject)">{{ f.subject }}</button>
              <span class="muted">{{ rel(f) }} {{ name }}</span>
            </template>
          </div>
          <FactSummary :fact="f" sources />
          <div><UiButton size="sm" :to="`/changes?target=${f.id}`">Propose change…</UiButton></div>
        </div>
      </div>
    </section>

    <section v-for="g in groups" :key="g.kind" class="block">
      <h3>{{ g.kind }}{{ g.kind === 'rule' ? 's' : g.facts.length > 1 ? 's' : '' }}</h3>
      <div class="facts">
        <div v-for="f in g.facts" :key="f.id" class="item">
          <FactSummary :fact="f" sources />
          <div><UiButton size="sm" :to="`/changes?target=${f.id}`">Propose change…</UiButton></div>
        </div>
      </div>
    </section>

    <section v-if="appearances.length" class="block">
      <h3>Appears in</h3>
      <ul class="apps">
        <li v-for="d in appearances" :key="d.id">
          <NuxtLink :to="`/documents/${d.id}`"><UiIcon name="file" :size="14" /> {{ d.title }}</NuxtLink>
          <NuxtLink v-for="[pid, line] in d.passages" :key="pid" class="faint ln" :to="`/documents/${d.id}#${pid}`">line {{ line }}</NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.profile { display: grid; gap: var(--s-5); min-width: 0; }
.top { display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; }
.top h2 { margin: 0; font-size: var(--text-xl); }
.block h3 { margin: 0 0 var(--s-2); font-size: var(--text-sm); color: var(--muted); font-weight: 600; text-transform: capitalize; }
.facts { display: grid; gap: var(--s-3); }
.item { display: grid; gap: var(--s-2); padding: var(--s-3) var(--s-4); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); min-width: 0; }
.apps { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
.rels { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.link { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--accent); cursor: pointer; text-decoration: underline; }
.apps li { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); align-items: center; }
.apps a { display: inline-flex; align-items: center; gap: 6px; }
.ln { font-size: var(--text-sm); }
</style>
