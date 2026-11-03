<script setup lang="ts">
// Every help page by group: the side list on /help/<slug> (desktop) and the "All help topics" sheet (phones).
import { HELP_GROUPS, pagesIn } from '~/help'

defineProps<{ current?: string }>()
</script>

<template>
  <nav class="topics" aria-label="Help topics">
    <NuxtLink to="/help" class="home">Help home</NuxtLink>
    <div v-for="g in HELP_GROUPS" :key="g.id" class="group">
      <h2>{{ g.title }}</h2>
      <NuxtLink v-for="x in pagesIn(g.id)" :key="x.slug" :to="`/help/${x.slug}`" :aria-current="x.slug === current ? 'page' : undefined">{{ x.title }}</NuxtLink>
    </div>
  </nav>
</template>

<style scoped>
.topics { display: grid; gap: var(--s-4); }
.home { font-weight: 600; color: var(--ink); text-decoration: none; }
.group { display: grid; }
h2 { font-size: var(--text-xs); font-weight: 600; color: var(--faint); margin: 0 0 var(--s-1); }
.group a { padding: 5px 10px; margin-left: -10px; border-radius: var(--r-md); color: var(--muted); text-decoration: none; font-size: var(--text-sm); }
.group a:hover { color: var(--ink); background: var(--sunken); }
.group a[aria-current=page] { color: var(--ink); font-weight: 600; background: var(--accent-soft); }
@media (max-width: 900px) { .group a { min-height: 40px; display: flex; align-items: center; margin-left: 0; } }
</style>
