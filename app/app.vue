<script setup lang="ts">
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })

const links = computed(() => [
  { to: '/', label: 'Overview' },
  { to: '/review', label: 'Review', count: stats.value?.pending },
  { to: '/canon', label: 'Canon' },
  { to: '/ask', label: 'Ask' },
  { to: '/conflicts', label: 'Conflicts', count: stats.value?.open_conflicts },
  { to: '/changes', label: 'Changes' },
  { to: '/metrics', label: 'Metrics' },
  { to: '/audit', label: 'Audit' },
])
</script>

<template>
  <header class="topbar">
    <div class="topbar-inner">
      <NuxtLink to="/" class="brand">Story Bible</NuxtLink>
      <nav class="nav" aria-label="Main">
        <NuxtLink v-for="l in links" :key="l.to" :to="l.to">
          {{ l.label }}<span v-if="l.count" class="count">{{ l.count }}</span>
        </NuxtLink>
      </nav>
      <span v-if="stats" class="chip model-chip" :class="stats.model.mode === 'mock' ? 'warn' : 'accent'" :title="stats.model.id">
        {{ stats.model.mode === 'mock' ? 'Recorded run' : 'Live model' }}
      </span>
    </div>
  </header>
  <main class="shell">
    <NuxtPage />
  </main>
</template>
