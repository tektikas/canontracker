<script setup lang="ts">
import type { IconName } from '~/components/ui/Icon.vue'

const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const route = useRoute()
const navOpen = ref(false)
const navTrigger = ref<HTMLButtonElement>()
const navClose = ref<HTMLButtonElement>()
watch(() => route.fullPath, () => { navOpen.value = false })
// Mobile drawer: the rest of the page is inert while it is open, so focus moves in and Tab stays inside.
watch(navOpen, async (open) => {
  await nextTick()
  ;(open ? navClose : navTrigger).value?.focus()
})

interface NavLink { to: string, label: string, icon: IconName, count?: number, tone?: 'accent' | 'bad' }
const groups = computed<{ label?: string, links: NavLink[] }[]>(() => [
  { links: [{ to: '/', label: 'Home', icon: 'home' }] },
  {
    label: 'Workflow',
    links: [
      { to: '/review', label: 'Review', icon: 'review', count: stats.value?.pending || undefined, tone: 'accent' },
      { to: '/canon', label: 'Canon', icon: 'canon', count: stats.value?.canon || undefined },
      { to: '/conflicts', label: 'Conflicts', icon: 'conflicts', count: stats.value?.open_conflicts || undefined, tone: 'bad' },
      { to: '/changes', label: 'Changes', icon: 'changes', count: stats.value?.changes || undefined },
    ],
  },
  {
    label: 'Tools',
    links: [
      { to: '/ask', label: 'Ask canon', icon: 'ask' },
      { to: '/metrics', label: 'Metrics', icon: 'metrics' },
      { to: '/audit', label: 'Audit log', icon: 'audit' },
    ],
  },
])
const recorded = computed(() => stats.value?.model.mode === 'mock')
</script>

<template>
  <div class="app" :class="{ 'nav-open': navOpen }" @keydown.esc="navOpen = false">
    <header class="topbar" :inert="navOpen">
      <button ref="navTrigger" class="icon-btn" type="button" aria-label="Open navigation" :aria-expanded="navOpen" aria-controls="sidebar" @click="navOpen = true">
        <UiIcon name="menu" :size="20" />
      </button>
      <NuxtLink to="/" class="brand"><BrandMark />Story Bible</NuxtLink>
      <UiBadge v-if="stats" :tone="recorded ? 'warn' : 'good'" dot :title="stats.model.label">
        {{ recorded ? 'Recorded run' : 'Live model' }}
      </UiBadge>
    </header>

    <div class="scrim" @click="navOpen = false" />

    <aside id="sidebar" class="sidebar" aria-label="Sidebar">
      <div class="sidebar-head">
        <NuxtLink to="/" class="brand"><BrandMark />Story Bible</NuxtLink>
        <button ref="navClose" class="icon-btn" type="button" aria-label="Close navigation" @click="navOpen = false">
          <UiIcon name="close" :size="20" />
        </button>
      </div>

      <nav class="nav" aria-label="Main">
        <div v-for="(g, i) in groups" :key="i" class="nav-group">
          <div v-if="g.label" class="nav-group-label">{{ g.label }}</div>
          <NuxtLink v-for="l in g.links" :key="l.to" :to="l.to" class="nav-link">
            <UiIcon :name="l.icon" />
            <span class="nav-label">{{ l.label }}</span>
            <span v-if="l.count" class="nav-count" :class="l.tone">{{ l.count }}</span>
          </NuxtLink>
        </div>
      </nav>

      <div v-if="stats" class="model-status" :class="{ live: !recorded }" :title="stats.model.id">
        <span class="status-dot" aria-hidden="true" />
        <div>
          <b>{{ recorded ? 'Recorded run' : 'Live model' }}</b>
          <span>{{ recorded ? 'Model output is replayed from a recorded extraction, not called live.' : stats.model.label }}</span>
        </div>
      </div>
    </aside>

    <main class="shell" :inert="navOpen">
      <NuxtPage />
    </main>
  </div>
</template>
