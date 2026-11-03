<script setup lang="ts">
// A real product screenshot (scripts/brand/render-shots.mjs), light or dark to match the reader's system theme.
// ponytail: follows prefers-color-scheme, not a theme toggled in the app's palette; use two <img>s if that ever matters.
withDefaults(defineProps<{ name: string, alt: string, eager?: boolean, sizes?: string }>(), { sizes: '(max-width: 720px) 100vw, 720px' })
</script>

<template>
  <figure class="shot">
    <picture>
      <source media="(prefers-color-scheme: dark)" :srcset="`/shots/${name}-dark-720.webp 720w, /shots/${name}-dark-1280.webp 1280w`" :sizes="sizes" type="image/webp">
      <img
        :src="`/shots/${name}-light-1280.webp`" :srcset="`/shots/${name}-light-720.webp 720w, /shots/${name}-light-1280.webp 1280w`" :sizes="sizes"
        :alt="alt" width="1280" height="800" :loading="eager ? 'eager' : 'lazy'" :fetchpriority="eager ? 'high' : 'auto'" decoding="async"
      >
    </picture>
  </figure>
</template>

<style scoped>
.shot { margin: 0; padding: 6px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; min-width: 0; }
.shot img { display: block; width: 100%; height: auto; border-radius: 9px; border: 1px solid var(--line); background: var(--canvas); }
</style>
