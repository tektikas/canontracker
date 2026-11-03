<script setup lang="ts">
// Top of an inner marketing page: breadcrumb, the page's one h1, a lead paragraph and an optional illustration.
defineProps<{ title: string, lead: string, art?: string, artAlt?: string, crumb?: { to: string, label: string } }>()
</script>

<template>
  <header class="mk-hero" :class="{ 'with-art': art }">
    <div>
      <NuxtLink v-if="crumb" :to="crumb.to" class="crumb">{{ crumb.label }}</NuxtLink>
      <h1>{{ title }}</h1>
      <p class="lead">{{ lead }}</p>
      <div v-if="$slots.default" class="actions"><slot /></div>
    </div>
    <LandingArt v-if="art" :name="art" :alt="artAlt ?? ''" :size="280" eager class="hero-art" />
  </header>
</template>

<style scoped>
.mk-hero { max-width: var(--mk-max); margin: 0 auto; padding: 64px var(--mk-pad) 56px; display: grid; gap: var(--s-7); align-items: center; }
.mk-hero.with-art { grid-template-columns: minmax(0, 1fr) 240px; }
.crumb { display: inline-block; margin-bottom: var(--s-3); color: var(--muted); font-weight: 500; }
h1 { font-size: clamp(2rem, 1.4rem + 2vw, 3rem); line-height: 1.08; letter-spacing: -0.03em; margin-bottom: var(--s-4); max-width: 22ch; text-wrap: balance; }
.lead { font-size: 1.125rem; line-height: 1.6; color: var(--muted); margin: 0; max-width: 62ch; }
.actions { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-top: var(--s-5); }
.hero-art { width: 240px; }
@media (max-width: 720px) {
  .mk-hero { padding-block: var(--s-6) var(--s-6); gap: var(--s-5); }
  .mk-hero.with-art { grid-template-columns: minmax(0, 1fr); }
  .hero-art { width: 140px; grid-row: 1; }
  .actions .btn { flex: 1 1 auto; }
}
</style>
