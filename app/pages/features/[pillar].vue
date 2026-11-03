<script setup lang="ts">
// Keyed by path: moving between pillars remounts, so the title and meta follow.
definePageMeta({ layout: 'marketing', key: route => route.path })
const route = useRoute()
const pillar = computed(() => PILLARS.find(p => p.slug === route.params.pillar))
if (!pillar.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
const p = pillar.value!
useMarketingSeo({ title: p.title, description: p.lead, path: `/features/${p.slug}` })
const others = computed(() => PILLARS.filter(x => x.slug !== route.params.pillar))
</script>

<template>
  <div v-if="pillar">
    <MarketingHero :title="pillar.title" :lead="pillar.lead" :art="pillar.art" :crumb="{ to: '/features', label: 'Features' }" />
    <div class="sections">
      <MarketingFeature v-for="(s, i) in pillar.sections" :key="s.title" :section="s" :flip="i % 2 === 1" />
    </div>
    <nav class="more" aria-label="Other features">
      <h2>More features</h2>
      <ul>
        <li v-for="o in others" :key="o.slug">
          <NuxtLink :to="`/features/${o.slug}`"><b>{{ o.title }}</b><span>{{ o.short }}</span></NuxtLink>
        </li>
      </ul>
    </nav>
    <MarketingCta />
  </div>
</template>

<style scoped>
.sections { max-width: var(--mk-max); margin: 0 auto; padding: 64px var(--mk-pad); display: grid; gap: 96px; border-top: 1px solid var(--line); }
.more { max-width: var(--mk-max); margin: 0 auto; padding: var(--s-7) var(--mk-pad) 0; border-top: 1px solid var(--line); }
.more h2 { font-size: var(--text-lg); margin-bottom: var(--s-4); }
.more ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--s-3); }
.more a { display: grid; gap: 4px; height: 100%; padding: var(--s-4); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); color: var(--ink); text-decoration: none; }
.more a:hover { border-color: var(--accent); }
.more a span { color: var(--muted); font-size: var(--text-sm); line-height: 1.45; }
@media (max-width: 1100px) { .more ul { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 720px) {
  .sections { padding-block: var(--s-7); gap: 64px; }
  .more ul { grid-template-columns: minmax(0, 1fr); }
}
</style>
