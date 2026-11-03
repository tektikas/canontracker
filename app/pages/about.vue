<script setup lang="ts">
definePageMeta({ layout: 'marketing' })
useMarketingSeo({ title: 'About', description: 'Story Bible was built by Umur for the Meta AI Developer Hackathon, 27 October to 4 November 2026. It is open source under AGPL-3.0.', path: '/about' })
</script>

<template>
  <div>
    <MarketingHero title="About Story Bible" lead="A story builder for anyone building a story world, made so the AI does the reading and people keep the say." art="novelists" art-alt="A manuscript tied with twine, a cup of tea and a fountain pen." />
    <div class="about">
      <section>
        <h2>Why it exists</h2>
        <p>Every long story ends up with a “bible”: the document that says who is who, where things are and what the rules of the world are. It is usually out of date, and nobody can say where a fact in it came from.</p>
        <p>Story Bible builds that bible from the story itself. The AI reads your documents and proposes facts with the sentence they came from; a person decides; the bible stays tied to its sources, finds its own contradictions and shows what a change will touch.</p>
      </section>
      <section>
        <h2>How it was made</h2>
        <p>Story Bible was built by Umur for the Meta AI Developer Hackathon, held from 27 October to 4 November 2026. Which AI model does what is on the <NuxtLink to="/agents">AI agents</NuxtLink> page.</p>
        <p>It is a Nuxt app with a SQLite database, and it is <a :href="GITHUB">open source on GitHub</a> under <a :href="LICENSE_URL">AGPL-3.0</a>. Every change is in the <NuxtLink to="/changelog">changelog</NuxtLink>, and what comes next is on the roadmap in the repository.</p>
      </section>
      <section>
        <h2>The sample stories</h2>
        <p>Broken Tide, Lantern Row and The Ashbell Pass are original, synthetic stories written for Story Bible, with contradictions planted on purpose so you can see the checks work. They are not based on any published work.</p>
      </section>
      <section>
        <h2>Pricing and contact</h2>
        <p>Self-hosting is free. If you would like us to host Story Bible for your team, <a :href="CONTACT">write to info@tektik.ai</a> and we’ll give you a price. <NuxtLink to="/pricing">See pricing</NuxtLink>.</p>
        <p>The market, business model, go-to-market and team are in the <NuxtLink to="/pitch">pitch deck</NuxtLink>.</p>
      </section>
    </div>
    <MarketingCta />
  </div>
</template>

<style scoped>
.about { max-width: var(--mk-max); margin: 0 auto; padding: var(--s-6) var(--mk-pad) 0; border-top: 1px solid var(--line); display: grid; gap: var(--s-6); }
.about section { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: var(--s-5); }
.about h2 { font-size: var(--text-lg); margin: 2px 0 0; }
.about p { grid-column: 2; margin: 0; max-width: 68ch; line-height: 1.7; font-size: 1rem; color: var(--muted); }
.about h2 { grid-row: span 3; }
@media (max-width: 720px) {
  .about section { grid-template-columns: minmax(0, 1fr); gap: var(--s-2); }
  .about p { grid-column: 1; }
  .about h2 { grid-row: auto; }
}
</style>
