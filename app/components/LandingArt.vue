<script setup lang="ts">
// Pencil-and-ink illustrations on linen paper (public/art, scripts/brand/README.md). They are printed on the paper
// colour, so in both themes they sit on a linen plate that matches it.
defineProps<{ name: string, alt: string, size?: number, eager?: boolean }>()
</script>

<template>
  <img
    class="landing-art" :src="`/art/${name}.webp`" :alt="alt" :width="size ?? 320" :height="size ?? 320"
    :loading="eager ? 'eager' : 'lazy'" :fetchpriority="eager ? 'high' : 'auto'" decoding="async"
  >
</template>

<style scoped>
/* #f4f0e8 is the paper the art was drawn on, not a theme token: it stays linen in dark mode too. */
.landing-art { display: block; width: 100%; height: auto; aspect-ratio: 1; background: #f4f0e8; border-radius: var(--r-lg); }
@media screen and (prefers-color-scheme: dark) { :root:not([data-theme=light]) .landing-art { filter: brightness(0.92); } }
:root[data-theme=dark] .landing-art { filter: brightness(0.92); }
</style>
