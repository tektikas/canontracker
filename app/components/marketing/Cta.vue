<script setup lang="ts">
// Closing call to action on every marketing page: try it here, or run it yourself.
const me = useMe()
defineProps<{ title?: string, text?: string }>()
</script>

<template>
  <section class="cta-band">
    <div class="cta-inner">
      <LandingArt name="canon" alt="" :size="160" class="cta-art" />
      <div class="cta-copy">
        <h2>{{ title ?? 'Start with a finished story' }}</h2>
        <p>{{ text ?? 'Create a studio and load The Ashbell Pass or Broken Tide: real documents, AI candidates to review and planted contradictions to find. Or run Story Bible on your own server; it is open source.' }}</p>
      </div>
      <div class="cta-actions">
        <UiButton v-if="me?.user" to="/" variant="primary" size="lg">Open the app</UiButton>
        <UiButton v-else to="/signup" variant="primary" size="lg">Start free</UiButton>
        <UiButton :to="GITHUB" size="lg">Self-host from GitHub</UiButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cta-band { max-width: var(--mk-max); margin: var(--s-7) auto 0; padding: 0 var(--mk-pad); }
.cta-inner { display: grid; grid-template-columns: 120px minmax(0, 1fr) auto; gap: var(--s-5); align-items: center; padding: var(--s-6); background: var(--raised); border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: var(--r-lg); }
.cta-art { width: 120px; }
.cta-copy h2 { font-size: var(--text-xl); letter-spacing: -0.02em; margin-bottom: var(--s-2); }
.cta-copy p { margin: 0; color: var(--muted); max-width: 62ch; line-height: 1.55; }
.cta-actions { display: grid; gap: var(--s-2); }
@media (max-width: 900px) {
  .cta-inner { grid-template-columns: 88px minmax(0, 1fr); }
  .cta-art { width: 88px; }
  .cta-actions { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; }
}
@media (max-width: 520px) {
  .cta-inner { grid-template-columns: minmax(0, 1fr); padding: var(--s-5); }
  .cta-art { display: none; }
  .cta-actions { grid-template-columns: 1fr; }
}
</style>
