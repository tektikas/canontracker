<script setup lang="ts">
// Keyed by path: moving between use cases remounts, so the title and meta follow.
definePageMeta({ layout: 'marketing', key: route => route.path })
const route = useRoute()
const uc = USE_CASES.find(u => u.slug === route.params.kind)
if (!uc) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
useMarketingSeo({ title: uc.title, description: uc.lead, path: `/use-cases/${uc.slug}` })
const me = useMe()
</script>

<template>
  <div v-if="uc">
    <MarketingHero :title="uc.title" :lead="uc.lead" :art="uc.art">
      <UiButton v-if="me?.user" to="/" variant="primary" size="lg">Open the app</UiButton>
      <UiButton v-else to="/signup" variant="primary" size="lg">Start free</UiButton>
      <UiButton to="/features" size="lg">See every feature</UiButton>
    </MarketingHero>

    <section class="block">
      <h2>What you do with it</h2>
      <ul class="jobs">
        <li v-for="j in uc.jobs" :key="j.title" :class="{ planned: j.title.startsWith('Planned') }">
          <h3>{{ j.title }}</h3>
          <p>{{ j.text }}</p>
        </li>
      </ul>
    </section>

    <section class="block shots">
      <figure v-for="s in uc.shots" :key="s.name">
        <MarketingShot :name="s.name" :alt="s.alt" />
        <figcaption>{{ s.alt }}</figcaption>
      </figure>
    </section>

    <section class="block sample">
      <LandingArt :name="uc.art" alt="" :size="120" class="sample-art" />
      <div>
        <h2>Try it on the sample</h2>
        <p>{{ uc.sample }} Load it from onboarding or from Settings, then review, scan and change it like your own story.</p>
      </div>
    </section>

    <nav class="block others" aria-label="Other use cases">
      <NuxtLink v-for="o in USE_CASES.filter(x => x.slug !== uc.slug)" :key="o.slug" :to="`/use-cases/${o.slug}`">{{ o.title }}</NuxtLink>
    </nav>

    <MarketingCta />
  </div>
</template>

<style scoped>
.block { max-width: var(--mk-max); margin: 0 auto; padding: 56px var(--mk-pad); border-top: 1px solid var(--line); }
.block h2 { font-size: var(--text-xl); letter-spacing: -0.02em; margin-bottom: var(--s-5); }
.jobs { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-5); }
.jobs li { padding-top: var(--s-3); border-top: 2px solid var(--accent); }
.jobs li.planned { border-top: 2px dashed var(--pencil); }
.jobs li.planned h3 { color: var(--pencil); }
.jobs h3 { font-size: var(--text-md); }
.jobs p { margin: 0; color: var(--muted); line-height: 1.55; }
.shots { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-5); }
.shots figure { margin: 0; min-width: 0; }
.shots figcaption { margin-top: var(--s-2); color: var(--faint); font-size: var(--text-sm); }
.sample { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: var(--s-5); align-items: center; }
.sample-art { width: 120px; }
.sample h2 { margin-bottom: var(--s-2); }
.sample p { margin: 0; color: var(--muted); max-width: 66ch; line-height: 1.6; font-size: 1rem; }
.others { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-5); padding-block: var(--s-5); }
.others a { font-weight: 500; }
@media (max-width: 1000px) { .jobs { grid-template-columns: 1fr 1fr; } }
@media (max-width: 720px) {
  .block { padding-block: var(--s-6); }
  .jobs, .shots { grid-template-columns: minmax(0, 1fr); }
  .sample { grid-template-columns: 72px minmax(0, 1fr); }
  .sample-art { width: 72px; }
}
</style>
