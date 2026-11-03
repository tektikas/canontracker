<script setup lang="ts">
// The `?` in the app shell: opens this page's help (app/help/routes.ts) in a new tab. The ? key does the same.
import { helpSlugFor } from '~/help/routes'

const route = useRoute()
const slug = computed(() => helpSlugFor(route.name))
</script>

<template>
  <a v-if="slug" :href="`/help/${slug}`" target="_blank" rel="noopener" class="icon-btn help-btn" aria-label="Help for this page" title="Help for this page (?)">
    <UiIcon name="help" :size="20" />
  </a>
</template>

<style scoped>
.help-btn { color: var(--muted); text-decoration: none; }
.help-btn:hover { color: var(--ink); }
.help-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
