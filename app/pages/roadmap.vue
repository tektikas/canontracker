<script setup lang="ts">
definePageMeta({ layout: 'marketing' })
useMarketingSeo({ title: 'Roadmap', description: 'What CanonTracker shipped recently, what is being built now and what comes next for novelists, TV rooms, game studios and worldbuilders. No dates promised.', path: '/roadmap' })
</script>

<template>
  <div>
    <MarketingHero title="Roadmap" lead="What just shipped, what we are building now and what comes after. There are no dates: an item moves up when it is ready, and lands on the changelog when it ships." />
    <div class="body">
      <nav class="toc" aria-label="On this page">
        <a v-for="s in ROADMAP" :key="s.id" :href="`#${s.id}`">{{ s.title }}<span>{{ s.items.length }}</span></a>
        <NuxtLink to="/changelog">Changelog</NuxtLink>
      </nav>
      <div class="stages">
        <section v-for="s in ROADMAP" :id="s.id" :key="s.id" class="stage" :class="s.id">
          <h2>{{ s.title }}</h2>
          <p class="stage-lead">{{ s.lead }}</p>
          <ul>
            <li v-for="it in s.items" :key="it.title">
              <b>{{ it.title }}</b>
              <span>{{ it.text }}</span>
              <span v-if="it.for" class="for">
                <span v-for="a in it.for" :key="a" class="chip">{{ AUDIENCES[a] }}</span>
              </span>
            </li>
          </ul>
        </section>
        <p class="report">Missing something your story needs, or something here that should come sooner? <a :href="`${GITHUB}/issues`">Open an issue on GitHub</a> or write to <a :href="CONTACT">info@tektik.ai</a>.</p>
      </div>
    </div>
    <MarketingCta />
  </div>
</template>

<style scoped>
.body { max-width: var(--mk-max); margin: 0 auto; padding: var(--s-7) var(--mk-pad) 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: var(--s-7); }
.toc { position: sticky; top: 84px; align-self: start; display: grid; gap: 2px; }
.toc a { display: flex; justify-content: space-between; gap: var(--s-2); padding: 6px 10px; border-left: 2px solid var(--line); color: var(--muted); text-decoration: none; }
.toc a:hover { color: var(--ink); border-left-color: var(--accent); }
.toc a span { color: var(--faint); font-variant-numeric: tabular-nums; }
.stages { display: grid; gap: var(--s-6); }
.stage { scroll-margin-top: 84px; }
.stage h2 { font-size: var(--text-xl); letter-spacing: -0.02em; margin-bottom: var(--s-1); }
.stage-lead { margin: 0 0 var(--s-3); color: var(--muted); }
.stage ul { margin: 0; padding: 0; list-style: none; display: grid; border-top: 1px solid var(--line); }
.stage li { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 4px var(--s-4); padding: var(--s-3) 0 var(--s-3) var(--s-5); border-bottom: 1px solid var(--line); line-height: 1.55; position: relative; }
.stage li > span { color: var(--muted); max-width: 70ch; }
.stage li .for { grid-column: 2; display: flex; flex-wrap: wrap; gap: 6px; }
/* Marker per stage: shipped filled, building a ring, planned dashed (as on /security). */
.stage li::before { content: ''; position: absolute; left: 2px; top: 1.15em; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.stage.building li::before { background: none; border: 2px solid var(--accent); }
.stage.next li::before, .stage.later li::before { background: none; border: 1.5px dashed var(--pencil); }
.stage.later li b { color: var(--muted); }
.report { margin: 0; padding: var(--s-4); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); }
@media (max-width: 900px) {
  .body { grid-template-columns: minmax(0, 1fr); gap: var(--s-5); }
  .toc { position: static; grid-template-columns: 1fr 1fr; }
  .stage li { grid-template-columns: minmax(0, 1fr); }
  .stage li .for { grid-column: 1; }
}
@media (max-width: 520px) { .toc { grid-template-columns: minmax(0, 1fr); } }
</style>
