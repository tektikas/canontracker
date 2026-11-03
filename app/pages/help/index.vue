<script setup lang="ts">
import { HELP_GROUPS, START_PATH, HELP_PAGES, pagesIn, helpText } from '~/help'

definePageMeta({ layout: 'marketing' })
useMarketingSeo({ title: 'Help', description: 'How to use every screen in Story Bible: step by step, with the exact labels, who can do what, and the ideas behind canon, evidence, conflicts and impact.', path: '/help' })

const q = ref('')
const all = Object.values(HELP_PAGES).map(p => ({ p, text: helpText(p) }))
// Every word typed must appear somewhere in the page; titles first.
const results = computed(() => {
  const words = q.value.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return all.filter(r => words.every(w => r.text.includes(w)))
    .sort((a, b) => +words.every(w => b.p.title.toLowerCase().includes(w)) - +words.every(w => a.p.title.toLowerCase().includes(w)))
    .map(r => r.p)
})
</script>

<template>
  <div>
    <MarketingHero title="Help" lead="How every screen works, step by step with the labels you see in the app, and the ideas behind canon, evidence, conflicts and impact. In the app, the ? button on any page opens its help here." art="canon" art-alt="An open ledger with a pen.">
      <form class="search" role="search" @submit.prevent>
        <label for="help-q" class="sr-only">Search help</label>
        <UiIcon name="search" :size="18" class="search-icon" />
        <input id="help-q" v-model="q" type="search" placeholder="Search help, e.g. merge, quote, viewer" autocomplete="off">
      </form>
    </MarketingHero>

    <div class="wrap">
      <section v-if="q.trim()" aria-live="polite" class="results">
        <h2>{{ results.length ? `${results.length} ${results.length === 1 ? 'page' : 'pages'} for “${q.trim()}”` : `Nothing found for “${q.trim()}”` }}</h2>
        <ul v-if="results.length" class="topics">
          <li v-for="p in results" :key="p.slug"><NuxtLink :to="`/help/${p.slug}`"><b>{{ p.title }}</b><span>{{ p.summary }}</span></NuxtLink></li>
        </ul>
        <p v-else class="muted">Try a shorter word, or browse the topics below.</p>
      </section>

      <section class="start" aria-labelledby="start-h">
        <h2 id="start-h">Start here</h2>
        <ol class="start-path">
          <li v-for="(s, i) in START_PATH" :key="s.slug">
            <NuxtLink :to="`/help/${s.slug}`"><span class="n">{{ i + 1 }}</span><span><b>{{ s.step }}</b><span>{{ HELP_PAGES[s.slug].summary }}</span></span></NuxtLink>
          </li>
        </ol>
      </section>

      <section v-for="g in HELP_GROUPS.filter(g => g.id !== 'start')" :key="g.id" class="group" :aria-labelledby="`g-${g.id}`">
        <div class="group-head">
          <h2 :id="`g-${g.id}`">{{ g.title }}</h2>
          <p>{{ g.text }}</p>
        </div>
        <ul class="topics">
          <li v-for="p in pagesIn(g.id)" :key="p.slug"><NuxtLink :to="`/help/${p.slug}`"><b>{{ p.title }}</b><span>{{ p.summary }}</span></NuxtLink></li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.wrap { max-width: var(--mk-max); margin: 0 auto; padding: 0 var(--mk-pad); display: grid; gap: var(--s-7); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.search { position: relative; width: min(100%, 520px); }
.search input { width: 100%; min-height: 48px; padding: 0 var(--s-4) 0 44px; font-size: 1rem; }
.search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--faint); pointer-events: none; }
h2 { font-size: var(--text-xl); letter-spacing: -0.02em; margin: 0 0 var(--s-4); }
.start-path { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--s-3); }
.start-path a { display: flex; gap: var(--s-3); height: 100%; padding: var(--s-4); border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--raised); color: var(--ink); text-decoration: none; }
.start-path a:hover { border-color: var(--accent); }
.start-path a > span:last-child { display: grid; gap: 4px; align-content: start; }
.start-path a span span { color: var(--muted); font-size: var(--text-sm); line-height: 1.45; }
.n { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); font-weight: 700; font-size: var(--text-sm); }
.group { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 3fr); gap: var(--s-6); padding-top: var(--s-6); border-top: 1px solid var(--line); }
.group-head h2 { margin-bottom: var(--s-2); font-size: var(--text-lg); }
.group-head p { color: var(--muted); margin: 0; line-height: 1.5; }
.topics { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-2); }
.topics a { display: grid; gap: 2px; height: 100%; padding: var(--s-3) var(--s-4); border-radius: var(--r-md); color: var(--ink); text-decoration: none; border: 1px solid transparent; }
.topics a:hover, .topics a:focus-visible { background: var(--raised); border-color: var(--line); }
.topics a b { font-weight: 600; color: var(--accent); }
.topics a span { color: var(--muted); font-size: var(--text-sm); line-height: 1.45; }
.results h2 { font-size: var(--text-lg); }
@media (max-width: 1100px) { .start-path { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); } }
@media (max-width: 900px) { .group { grid-template-columns: minmax(0, 1fr); gap: var(--s-3); } }
@media (max-width: 620px) { .topics { grid-template-columns: minmax(0, 1fr); } .topics a { padding-inline: 0; } }
</style>
