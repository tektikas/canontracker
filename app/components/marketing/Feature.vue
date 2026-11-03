<script setup lang="ts">
import type { Section } from '~/utils/marketing'

// One feature: heading, text and points beside its screenshot; `flip` puts the screenshot first on wide screens.
defineProps<{ section: Section, flip?: boolean, level?: 'h2' | 'h3' }>()
</script>

<template>
  <section class="feat" :class="{ flip, solo: !section.shot }">
    <div class="feat-copy">
      <component :is="level ?? 'h2'">{{ section.title }}</component>
      <p>{{ section.text }}</p>
      <ul v-if="section.points.length">
        <li v-for="pt in section.points" :key="pt">{{ pt }}</li>
      </ul>
      <slot />
    </div>
    <MarketingShot v-if="section.shot" :name="section.shot.name" :alt="section.shot.alt" />
  </section>
</template>

<style scoped>
.feat { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: var(--s-7); align-items: center; }
.feat.flip { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); }
.feat.flip .feat-copy { order: 2; }
.feat.solo { grid-template-columns: minmax(0, 1fr); }
.feat.solo .feat-copy { max-width: 68ch; }
.feat-copy h2, .feat-copy h3 { font-size: var(--text-xl); letter-spacing: -0.02em; margin-bottom: var(--s-3); }
.feat-copy p { color: var(--muted); font-size: 1rem; line-height: 1.6; margin: 0 0 var(--s-4); max-width: 60ch; }
.feat-copy ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
.feat-copy li { position: relative; padding-left: 22px; line-height: 1.5; }
/* An ink tick, the same mark as an accepted fact. */
.feat-copy li::before { content: ''; position: absolute; left: 2px; top: 0.45em; width: 10px; height: 6px; border-left: 2px solid var(--accent); border-bottom: 2px solid var(--accent); transform: rotate(-45deg); }
@media (max-width: 900px) {
  .feat, .feat.flip { grid-template-columns: minmax(0, 1fr); gap: var(--s-5); }
  .feat.flip .feat-copy { order: 0; }
}
</style>
