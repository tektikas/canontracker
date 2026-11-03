<script setup lang="ts">
// Pencil-and-ink illustrations on linen paper (public/art, scripts/brand/README.md); the linen ground is blended away (see style).
defineProps<{ name: string, alt: string, size?: number, eager?: boolean }>()
</script>

<template>
  <img
    class="landing-art" :src="`/art/${name}.webp`" :alt="alt" :width="size ?? 320" :height="size ?? 320"
    :loading="eager ? 'eager' : 'lazy'" :fetchpriority="eager ? 'high' : 'auto'" decoding="async"
  >
</template>

<style scoped>
/* The art is ink on a linen ground. Instead of a paper plate, the ground is blended away: lifted to white and multiplied
   in light mode; in dark mode lifted, inverted with its hue kept (so walnut ink becomes warm chalk) and screened, so the
   ground turns black and vanishes into the page. Only the drawing remains, in both themes. */
.landing-art { display: block; width: 100%; height: auto; aspect-ratio: 1; filter: brightness(1.16); mix-blend-mode: multiply; }
@media screen and (prefers-color-scheme: dark) { :root:not([data-theme=light]) .landing-art { filter: brightness(1.16) invert(1) hue-rotate(180deg); mix-blend-mode: screen; } }
:root[data-theme=dark] .landing-art { filter: brightness(1.16) invert(1) hue-rotate(180deg); mix-blend-mode: screen; }
</style>
