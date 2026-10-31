<script setup lang="ts">
// The same transparent artwork serves both themes; PNG is the fallback for WebP.
defineProps<{ name: string, alt: string, width: number, height: number, eager?: boolean }>()
</script>

<template>
  <picture class="landing-art">
    <source :srcset="`/art/${name}.webp`" type="image/webp">
    <img :src="`/art/${name}.png`" :alt="alt" :width="width" :height="height" :loading="eager ? 'eager' : 'lazy'" :fetchpriority="eager ? 'high' : 'auto'" decoding="async">
  </picture>
</template>

<style scoped>
.landing-art { display: block; }
.landing-art img { display: block; width: 100%; height: auto; }
</style>
