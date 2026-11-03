<script setup lang="ts">
definePageMeta({ layout: 'marketing' })
useMarketingSeo({ title: 'Pricing', description: 'Story Bible is open source under AGPL-3.0: self-host the whole app for free. For a hosted copy for your team, ask us for a price.', path: '/pricing' })

const INCLUDED = [
  'AI candidates with verbatim quotes, the AI critic and human review',
  'Canon list, relationship graph, timeline and entity wiki',
  'Conflict rules, AI rule checks and change impact',
  'Markdown, text, Word and voice import; writing in the app',
  'Continuity checks, Ask and Research',
  'Export as Markdown, PDF and EPUB; share links',
  'Studios, projects, roles, invites and the audit log',
  'The MCP server and API tokens for your own agents',
]
</script>

<template>
  <div>
    <MarketingHero title="Pricing" lead="Story Bible is open source. Run it yourself for free, with everything in it, or ask us to host it for your team." />

    <section class="plans" aria-label="Options">
      <article class="plan">
        <h2>Open source</h2>
        <p class="price">Free</p>
        <p class="what">Self-host the whole app on your own server. Every feature on this site is in it.</p>
        <UiButton :to="GITHUB" variant="primary" size="lg">View on GitHub</UiButton>
        <p class="license">Open source under <a :href="LICENSE_URL">AGPL-3.0</a>. Self-hosting is free; if you run a modified version as a service for others, you share its source.</p>
      </article>
      <article class="plan">
        <h2>Cloud</h2>
        <p class="price">Ask for a price</p>
        <p class="what">We host Story Bible for your team, so you don’t run a server. Tell us about your team and project.</p>
        <UiButton :to="CONTACT" size="lg">Contact us</UiButton>
        <p class="license">Write to <a :href="CONTACT">info@tektik.ai</a>.</p>
      </article>
    </section>

    <section class="included">
      <h2>Included either way</h2>
      <ul>
        <li v-for="i in INCLUDED" :key="i">{{ i }}</li>
      </ul>
      <p class="note">AI features call an AI model provider (<NuxtLink to="/agents">which one</NuxtLink>). When you self-host, you bring your own API key and its usage is billed to you by the provider.</p>
    </section>

    <MarketingCta />
  </div>
</template>

<style scoped>
.plans { max-width: var(--mk-max); margin: 0 auto; padding: var(--s-7) var(--mk-pad); border-top: 1px solid var(--line); display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-5); }
.plan { display: grid; align-content: start; justify-items: start; gap: var(--s-3); padding: var(--s-6); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); }
.plan:first-child { border-top: 4px solid var(--accent); }
.plan:last-child { border-top: 4px solid var(--line-strong); }
.plan h2 { margin: 0; font-size: var(--text-lg); }
.price { margin: 0; font-size: 2.25rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1.1; }
.what { margin: 0 0 var(--s-2); color: var(--muted); line-height: 1.55; font-size: 1rem; }
.license { margin: var(--s-2) 0 0; color: var(--muted); font-size: var(--text-sm); line-height: 1.55; }
.included { max-width: var(--mk-max); margin: 0 auto; padding: var(--s-6) var(--mk-pad) 0; }
.included h2 { font-size: var(--text-xl); letter-spacing: -0.02em; }
.included ul { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2) var(--s-6); }
.included li { position: relative; padding-left: 22px; line-height: 1.5; }
.included li::before { content: ''; position: absolute; left: 2px; top: 0.45em; width: 10px; height: 6px; border-left: 2px solid var(--accent); border-bottom: 2px solid var(--accent); transform: rotate(-45deg); }
.note { margin: var(--s-5) 0 0; color: var(--muted); max-width: 72ch; line-height: 1.6; }
@media (max-width: 720px) {
  .plans, .included ul { grid-template-columns: minmax(0, 1fr); }
  .plan { padding: var(--s-5); }
  .plan .btn { width: 100%; }
}
</style>
