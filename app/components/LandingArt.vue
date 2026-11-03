<script setup lang="ts">
// Pencil-and-ink illustrations, cut out of their paper ground (public/art, scripts/brand/README.md).
defineProps<{ name: string, alt: string, size?: number, eager?: boolean }>()
</script>

<template>
  <img
    class="landing-art" :src="`/art/${name}.webp`" :alt="alt" :width="size ?? 320" :height="size ?? 320"
    :loading="eager ? 'eager' : 'lazy'" :fetchpriority="eager ? 'high' : 'auto'" decoding="async"
  >
</template>

<style scoped>
/* Transparent cut-outs (scripts/brand/README.md): the drawing sits straight on the page in both themes. */
.landing-art { display: block; width: 100%; height: auto; aspect-ratio: 1; }
</style>
