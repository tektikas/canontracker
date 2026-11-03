<script setup lang="ts">
definePageMeta({ layout: 'marketing' })
useMarketingSeo({ title: 'Features', description: 'Canon and review, conflicts and impact, a wiki and timeline, writing and import with Word and voice, export and share, and team roles: what CanonTracker does today.', path: '/features' })
</script>

<template>
  <div>
    <MarketingHero title="Everything between your first document and a story bible you can share" lead="CanonTracker is one workflow: bring documents in, let the AI propose facts, decide what is canon, keep it consistent and hand it on. Each area has its own page." art="story-world" art-alt="A small world drawn in pencil: a lighthouse on the coast and a mountain pass with a bell tower." />

    <div class="wrap">
      <section v-for="(p, i) in PILLARS" :key="p.slug" class="pillar" :class="{ flip: i % 2 }">
        <div class="pillar-head">
          <LandingArt :name="p.art" alt="" :size="160" class="pillar-art" />
          <div>
            <h2><NuxtLink :to="`/features/${p.slug}`">{{ p.title }}</NuxtLink></h2>
            <p>{{ p.lead }}</p>
            <ul>
              <li v-for="s in p.sections" :key="s.title">{{ s.title }}</li>
            </ul>
            <UiButton :to="`/features/${p.slug}`">More about {{ p.title.toLowerCase() }}</UiButton>
          </div>
        </div>
        <MarketingShot v-if="p.sections[0]?.shot" :name="p.sections[0].shot.name" :alt="p.sections[0].shot.alt" />
      </section>

      <section class="planned">
        <h2>On the roadmap, not built yet</h2>
        <p>Branching canon for player choices, project-level access, episodes and reveals for series, game script formats (Ink, Yarn Spinner, articy:draft, Twine) and a translation glossary. We list them here so you know what isn’t there today.</p>
      </section>
    </div>

    <MarketingCta />
  </div>
</template>

<style scoped>
.wrap { max-width: var(--mk-max); margin: 0 auto; padding: 0 var(--mk-pad); display: grid; }
.pillar { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: var(--s-7); align-items: center; padding-block: 64px; border-top: 1px solid var(--line); }
.pillar.flip { grid-template-columns: minmax(0, 6fr) minmax(0, 5fr); }
.pillar.flip .pillar-head { order: 2; }
.pillar-head { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: var(--s-5); align-items: start; }
.pillar-art { width: 96px; }
.pillar h2 { font-size: var(--text-xl); letter-spacing: -0.02em; }
.pillar h2 a { color: var(--ink); text-decoration: none; }
.pillar h2 a:hover { color: var(--accent); text-decoration: underline; }
.pillar p { color: var(--muted); line-height: 1.6; font-size: 1rem; }
.pillar ul { margin: 0 0 var(--s-5); padding-left: 1.1em; display: grid; gap: 4px; }
.planned { padding: var(--s-6); margin-top: var(--s-5); border: 1.5px dashed var(--line-strong); border-radius: var(--r-lg); }
.planned h2 { font-size: var(--text-lg); color: var(--pencil); }
.planned p { margin: 0; color: var(--muted); max-width: 72ch; line-height: 1.6; }
@media (max-width: 900px) {
  .pillar, .pillar.flip { grid-template-columns: minmax(0, 1fr); gap: var(--s-5); padding-block: var(--s-7); }
  .pillar.flip .pillar-head { order: 0; }
}
@media (max-width: 520px) {
  .pillar-head { grid-template-columns: minmax(0, 1fr); }
  .pillar-art { width: 88px; }
  .planned { padding: var(--s-4); }
}
</style>
