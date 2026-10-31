<script setup lang="ts">
// The story bible as a document: the print view (PDF) and public share pages render it from the same API shape.
// Data only, no app links or app requests, so a reader outside the studio sees exactly what the export holds.
const props = defineProps<{ bible: Bible }>()
const b = computed(() => props.bible)
const on = computed(() => new Set(b.value.sections))
const fact = computed(() => new Map(b.value.facts.map(f => [f.n, f])))
const kinds = computed(() => (Object.keys(KIND_LABEL) as EntityKind[])
  .map(k => ({ kind: k, label: KIND_LABEL[k].many, items: b.value.entities.filter(e => e.kind === k) })).filter(g => g.items.length))
const withCanon = computed(() => b.value.entities.filter(e => e.facts.length))
const extra = computed(() => b.value.facts.filter(f => !shownElsewhere(b.value, f.n)))
const showFacts = computed(() => on.value.has('facts') && (withCanon.value.length > 0 || b.value.other_facts.length > 0))

const contents = computed(() => [
  on.value.has('overview') && { id: 'overview', label: 'Overview' },
  ...(on.value.has('entities') ? kinds.value.map(g => ({ id: `kind-${g.kind}`, label: g.label })) : []),
  showFacts.value && { id: 'canon', label: 'Canon by entity' },
  b.value.rules.length && { id: 'rules', label: 'World rules' },
  b.value.timeline.length && { id: 'timeline', label: 'Timeline' },
  on.value.has('conflicts') && { id: 'conflicts', label: 'Open conflicts' },
  extra.value.length && { id: 'referenced', label: 'Facts referenced above' },
  b.value.sources.length && { id: 'sources', label: 'Sources' },
].filter(Boolean) as { id: string, label: string }[])
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
</script>

<template>
  <div class="bible">
    <header class="cover">
      <p class="kicker">Story bible</p>
      <h1>{{ b.title }}</h1>
      <p class="meta">{{ b.studio }} · {{ b.scope.label }} · generated {{ shortDate(b.generated_at) }}</p>
      <p class="promise">
        <UiIcon name="canon" :size="16" />
        <span>Only accepted canon. Every fact carries the exact words of the source it rests on.<template v-if="b.counts.sample"> Facts marked <b>Sample canon (preloaded)</b> came with a sample project: their quotes are verified, but no person decided them.</template></span>
      </p>
    </header>

    <nav v-if="contents.length > 2" class="contents" aria-label="Contents">
      <h2>Contents</h2>
      <ol><li v-for="c in contents" :key="c.id"><a :href="`#${c.id}`">{{ c.label }}</a></li></ol>
    </nav>

    <section v-if="on.has('overview')" id="overview" class="sec">
      <h2>Overview</h2>
      <dl class="stats">
        <div><dt>Canon facts</dt><dd>{{ b.counts.facts }}</dd></div>
        <div><dt>Entities</dt><dd>{{ b.counts.entities }}</dd></div>
        <div><dt>Sources</dt><dd>{{ b.counts.documents }}</dd></div>
      </dl>
      <p class="small muted">Scope: {{ b.scope.label }} · medium: {{ b.medium }}</p>
      <p v-if="b.counts.stale" class="notice warn"><UiIcon name="conflicts" :size="16" />{{ plural(b.counts.stale, 'fact cites', 'facts cite') }} an older version of its source. Re-check before relying on them.</p>
      <p v-if="!b.counts.facts" class="notice info">No accepted canon in this scope yet.</p>
    </section>

    <template v-if="on.has('entities')">
      <section v-for="g in kinds" :id="`kind-${g.kind}`" :key="g.kind" class="sec">
        <h2>{{ g.label }}</h2>
        <div class="cards">
          <article v-for="e in g.items" :id="e.key" :key="e.key" class="card-e">
            <div class="card-top">
              <EntityAvatar :entity="e" :size="64" />
              <div class="card-name">
                <h3>{{ e.name }}</h3>
                <p v-if="e.aliases.length" class="small muted">Also known as {{ e.aliases.join(', ') }}</p>
                <a v-if="e.facts.length" class="small" :href="`#${e.key}-canon`">{{ plural(e.facts.length, 'canon fact') }}</a>
                <p v-else-if="on.has('facts')" class="small faint">No canon fact names this page yet.</p>
              </div>
            </div>
            <div v-if="e.editorial" class="editorial">
              <p class="ed-label small">Editorial note · not canon</p>
              <p v-if="e.editorial.summary" class="ed-text">{{ e.editorial.summary }}</p>
              <dl v-if="e.editorial.fields.length" class="ed-fields small">
                <template v-for="f in e.editorial.fields" :key="f.label"><dt>{{ f.label }}</dt><dd>{{ f.value }}</dd></template>
              </dl>
              <p v-if="e.editorial.notes" class="ed-text notes">{{ e.editorial.notes }}</p>
            </div>
          </article>
        </div>
      </section>
    </template>

    <section v-if="showFacts" id="canon" class="sec">
      <h2>Canon by entity</h2>
      <div v-for="e in withCanon" :id="`${e.key}-canon`" :key="e.key" class="group">
        <h3 class="group-head"><EntityAvatar :entity="e" :size="28" />{{ e.name }} <span class="faint small">{{ KIND_LABEL[e.kind as EntityKind]?.one ?? e.kind }}</span></h3>
        <BibleFact v-for="n in e.facts" :key="n" :fact="fact.get(n)!" />
      </div>
      <div v-if="b.other_facts.length" class="group">
        <h3 class="group-head">Other canon</h3>
        <BibleFact v-for="n in b.other_facts" :key="n" :fact="fact.get(n)!" />
      </div>
    </section>

    <section v-if="b.rules.length" id="rules" class="sec">
      <h2>World rules</h2>
      <BibleFact v-for="n in b.rules" :key="n" :fact="fact.get(n)!" />
    </section>

    <section v-if="b.timeline.length" id="timeline" class="sec">
      <h2>Timeline</h2>
      <p class="small muted">Timed canon in story order. Day 1 starts at 00:00.</p>
      <ol class="timeline">
        <li v-for="n in b.timeline" :key="n">
          <span class="when mono" :class="{ approx: fact.get(n)!.approximate }">{{ fact.get(n)!.time_label }}</span>
          <span class="what">{{ fact.get(n)!.statement }}</span>
          <a class="ref mono small" :href="`#${n}`">{{ n }}</a>
        </li>
      </ol>
    </section>

    <section v-if="on.has('conflicts')" id="conflicts" class="sec">
      <h2>Open conflicts</h2>
      <p class="small muted">{{ b.conflicts.length ? 'Flagged as possible clashes in canon. Nobody has judged them yet.' : 'No open conflicts in this scope.' }}</p>
      <ul class="conflicts">
        <li v-for="(c, i) in b.conflicts" :key="i">
          <div class="row"><strong>{{ c.rule }}</strong><UiBadge v-if="c.model" tone="warn">Model-suggested</UiBadge></div>
          <p class="small">{{ c.rationale }}</p>
          <p class="small muted">Between <a v-for="(n, j) in c.facts" :key="n" :href="`#${n}`" class="mono">{{ n }}{{ j < c.facts.length - 1 ? ' and ' : '' }}</a></p>
        </li>
      </ul>
    </section>

    <section v-if="extra.length" id="referenced" class="sec">
      <h2>Facts referenced above</h2>
      <BibleFact v-for="f in extra" :key="f.n" :fact="f" />
    </section>

    <section v-if="b.sources.length" id="sources" class="sec">
      <h2>Sources</h2>
      <p class="small muted">Every document a fact above cites, at the version it cites. Sources are kept read-only.</p>
      <article v-for="s in b.sources" :key="`${s.file}-${s.version}-${s.document}`" class="source">
        <h3><UiIcon name="file" :size="15" />{{ s.document }}</h3>
        <p class="small muted">
          {{ [s.folder, s.file].filter(Boolean).join(' / ') }} · {{ s.kind }} · v{{ s.version }}<template v-if="s.latest_version > s.version"> (latest v{{ s.latest_version }})</template> · <span class="mono">sha256 {{ s.sha256 }}…</span>
        </p>
        <ul class="cites">
          <li v-for="(c, i) in s.citations" :key="i"><a :href="`#${c.fact}`" class="mono">{{ c.fact }}</a><span class="faint">{{ lineLabel(c) }}</span><span class="q">“{{ c.quote }}”</span></li>
        </ul>
      </article>
    </section>
  </div>
</template>

<style scoped>
.bible { max-width: 860px; margin: 0 auto; }
.cover { padding-bottom: var(--s-5); border-bottom: 2px solid var(--ink); margin-bottom: var(--s-5); }
.kicker { margin: 0 0 var(--s-2); color: var(--accent); font-weight: 600; font-size: var(--text-sm); }
.cover h1 { font-size: 2.5rem; margin-bottom: var(--s-2); overflow-wrap: anywhere; }
.meta { color: var(--muted); margin-bottom: var(--s-4); }
.promise { display: flex; gap: var(--s-2); align-items: flex-start; margin: 0; max-width: 66ch; color: var(--muted); font-size: var(--text-sm); }
.promise svg { color: var(--accent); margin-top: 2px; }
.contents { margin-bottom: var(--s-6); }
.contents h2 { font-size: var(--text-sm); color: var(--muted); margin-bottom: var(--s-2); }
.contents ol { margin: 0; padding-left: 1.4em; columns: 2; column-gap: var(--s-6); }
.contents li { padding: 2px 0; break-inside: avoid; }
.sec { margin-bottom: var(--s-7); scroll-margin-top: var(--s-5); }
.sec > h2 { font-size: var(--text-xl); padding-bottom: var(--s-2); border-bottom: 1px solid var(--line-strong); margin-bottom: var(--s-4); }
.stats { display: flex; flex-wrap: wrap; gap: var(--s-6); margin: 0 0 var(--s-3); }
.stats dt { color: var(--muted); font-size: var(--text-sm); }
.stats dd { margin: 0; font-size: var(--text-2xl); font-weight: 600; font-variant-numeric: tabular-nums; }
.sec .notice { margin-top: var(--s-3); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--s-3); }
.card-e { display: grid; gap: var(--s-3); align-content: start; padding: var(--s-4); border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--raised); break-inside: avoid; scroll-margin-top: var(--s-5); }
.card-top { display: flex; gap: var(--s-3); align-items: flex-start; }
.card-name { display: grid; gap: 2px; min-width: 0; }
.card-name h3 { margin: 0; overflow-wrap: anywhere; }
.card-name p { margin: 0; }
.editorial { padding: var(--s-3); border: 1px dashed var(--line-strong); border-radius: var(--r-md); }
.ed-label { margin: 0 0 var(--s-1); color: var(--pencil); font-weight: 600; }
.ed-text { margin: 0 0 var(--s-2); color: var(--ink); white-space: pre-line; }
.ed-text:last-child { margin-bottom: 0; }
.ed-fields { display: grid; grid-template-columns: max-content 1fr; gap: 2px var(--s-3); margin: 0 0 var(--s-2); }
.ed-fields dt { color: var(--muted); }
.ed-fields dd { margin: 0; }
.group { margin-bottom: var(--s-5); scroll-margin-top: var(--s-5); }
.group-head { display: flex; align-items: center; gap: var(--s-2); margin: 0 0 var(--s-1); font-size: var(--text-md); break-after: avoid; }
.timeline { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--accent); }
.timeline li { display: grid; grid-template-columns: 9.5rem minmax(0, 1fr) auto; gap: var(--s-3); padding: var(--s-2) 0 var(--s-2) var(--s-4); position: relative; break-inside: avoid; }
.timeline li::before { content: ""; position: absolute; left: -6px; top: 14px; width: 10px; height: 10px; border-radius: 50%; background: var(--raised); border: 2px solid var(--accent); }
.when { color: var(--muted); font-size: var(--text-sm); padding-top: 2px; }
.when.approx { color: var(--warn); }
.what { font-family: var(--font-story); }
.ref { padding-top: 2px; }
.conflicts { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }
.conflicts li { padding: var(--s-3) var(--s-4); border: 1px solid var(--line); border-left: 3px solid var(--bad); border-radius: 0 var(--r-md) var(--r-md) 0; background: var(--raised); break-inside: avoid; }
.conflicts p { margin: var(--s-1) 0 0; }
.source { padding: var(--s-3) 0; border-top: 1px solid var(--line); break-inside: avoid; }
.source h3 { display: flex; align-items: center; gap: var(--s-2); margin: 0 0 2px; font-size: var(--text-base); overflow-wrap: anywhere; }
.source h3 svg { color: var(--faint); }
.source > p { margin: 0 0 var(--s-2); overflow-wrap: anywhere; }
.cites { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: var(--text-sm); }
.cites li { display: grid; grid-template-columns: 3rem 6.5rem minmax(0, 1fr); gap: var(--s-2); }
.q { font-family: var(--font-story); font-style: italic; color: var(--ink); }
@media (max-width: 720px) {
  .cover h1 { font-size: var(--text-2xl); }
  .contents ol { columns: 1; }
  .stats { gap: var(--s-5); }
  .cards { grid-template-columns: 1fr; }
  .timeline li { grid-template-columns: minmax(0, 1fr) auto; }
  .when { grid-column: 1 / -1; padding: 0; }
  .cites li { grid-template-columns: 3rem minmax(0, 1fr); }
  .cites .q { grid-column: 1 / -1; }
}
@media print {
  .sec { margin-bottom: var(--s-6); }
  .sec > h2 { break-after: avoid; }
  #canon, #timeline, #sources { break-before: page; }
  .cards { grid-template-columns: 1fr 1fr; }
  .card-e { background: none; }
  a { color: inherit; text-decoration: none; }
}
</style>
