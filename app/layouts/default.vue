<script setup lang="ts">
import type { IconName } from '~/components/ui/Icon.vue'

const me = useMe()
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const { data: entities } = await useEntityList()
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
// The drawer only exists below the desktop breakpoint (main.css); entering desktop closes it so inert never outlives it.
let desktopMq: MediaQueryList | undefined
const closeOnDesktop = () => { if (desktopMq?.matches) navOpen.value = false }
onMounted(() => {
  desktopMq = matchMedia('(min-width: 901px)')
  desktopMq.addEventListener('change', closeOnDesktop)
})
onBeforeUnmount(() => desktopMq?.removeEventListener('change', closeOnDesktop))

interface NavLink { to: string, label: string, icon: IconName, count?: number, tone?: 'accent' | 'bad' }
const groups = computed<{ label?: string, links: NavLink[] }[]>(() => [
  { links: [{ to: '/', label: 'Home', icon: 'home' }, { to: '/library', label: 'Library', icon: 'library', count: stats.value?.documents || undefined }] },
  {
    label: 'Workflow',
    links: [
      { to: '/review', label: 'Review', icon: 'review', count: stats.value?.pending || undefined, tone: 'accent' },
      { to: '/canon', label: 'Canon', icon: 'canon', count: stats.value?.canon || undefined },
      { to: '/entities', label: 'Entities', icon: 'entities', count: entities.value?.length || undefined },
      { to: '/conflicts', label: 'Conflicts', icon: 'conflicts', count: stats.value?.open_conflicts || undefined, tone: 'bad' },
      { to: '/changes', label: 'Changes', icon: 'changes', count: stats.value?.changes || undefined },
      { to: '/notes', label: 'Notes', icon: 'note', count: stats.value?.open_notes || undefined },
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
  {
    label: 'Studio',
    links: [
      { to: '/settings/projects', label: 'Projects', icon: 'folder' },
      { to: '/settings/team', label: 'Team', icon: 'team' },
    ],
  },
])
const bottomLinks = computed(() => [groups.value[0]!.links[0]!, ...groups.value[1]!.links.slice(0, 3)])
const recorded = computed(() => stats.value?.model.mode === 'mock')
const current = computed(() => me.value?.current)
// Projects grouped by studio for the switcher; most people have one studio, so its heading only shows when there are several.
const byStudio = computed(() => {
  const out: { id: string, name: string, projects: { id: string, name: string }[] }[] = []
  for (const p of me.value?.projects ?? []) {
    const g = out.find(s => s.id === p.studio_id) ?? out[out.push({ id: p.studio_id, name: p.studio_name, projects: [] }) - 1]!
    g.projects.push(p)
  }
  return out
})
const switching = ref('')
async function open(id: string) {
  switching.value = id
  await openProject(id)
}
</script>

<template>
  <div class="app" :class="{ 'nav-open': navOpen }" @keydown.esc="navOpen = false">
    <header class="topbar" :inert="navOpen">
      <button ref="navTrigger" class="icon-btn" type="button" aria-label="Open navigation" :aria-expanded="navOpen" aria-controls="sidebar" @click="navOpen = true">
        <UiIcon name="menu" :size="20" />
      </button>
      <NuxtLink to="/" class="brand topbar-project">
        <BrandMark /><span class="topbar-name">{{ current?.project.name ?? 'Story Bible' }}</span>
      </NuxtLink>
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

      <UiMenu v-if="current" label="Switch project" class="switcher">
        <template #trigger>
          <span class="switch-text">
            <span class="switch-studio">{{ current.studio.name }}</span>
            <span class="switch-project">{{ current.project.name }}</span>
          </span>
          <UiIcon name="chevrons" :size="16" class="switch-icon" />
        </template>
        <template #default="{ close }">
        <template v-for="g in byStudio" :key="g.id">
          <div v-if="byStudio.length > 1" class="menu-label">{{ g.name }}</div>
          <button v-for="p in g.projects" :key="p.id" type="button" class="menu-item" :aria-current="p.id === current.project.id || undefined" @click="p.id === current.project.id ? close() : open(p.id)">
            <UiIcon name="folder" :size="16" />
            <span class="menu-grow">{{ p.name }}</span>
            <span v-if="switching === p.id" class="spinner" aria-label="Opening" />
            <UiIcon v-else-if="p.id === current.project.id" name="check" :size="16" class="menu-check" label="Current project" />
          </button>
        </template>
        <hr class="menu-sep">
        <NuxtLink to="/settings/projects" class="menu-item"><UiIcon name="settings" :size="16" />All projects</NuxtLink>
        <NuxtLink v-if="canManage(me)" to="/settings/projects?new=1" class="menu-item"><UiIcon name="plus" :size="16" />New project</NuxtLink>
        </template>
      </UiMenu>

      <nav class="nav" aria-label="Main">
        <div v-for="(g, i) in groups" :key="i" class="nav-group">
          <div v-if="g.label" class="nav-group-label">{{ g.label }}</div>
          <NuxtLink v-for="l in g.links" :key="l.to" :to="l.to" class="nav-link" :class="{ 'router-link-exact-active': l.to !== '/' && route.path.startsWith(`${l.to}/`) }">
            <UiIcon :name="l.icon" />
            <span class="nav-label">{{ l.label }}</span>
            <span v-if="l.count" class="nav-count" :class="l.tone">{{ l.count }}</span>
          </NuxtLink>
        </div>
      </nav>

      <div class="sidebar-foot">
        <div v-if="stats" class="model-status" :class="{ live: !recorded }" :title="stats.model.id">
          <span class="status-dot" aria-hidden="true" />
          <div>
            <b>{{ recorded ? 'Recorded run' : 'Live model' }}</b>
            <span>{{ recorded ? 'Model output is replayed from a recorded extraction, not called live.' : stats.model.label }}</span>
          </div>
        </div>

        <UiMenu v-if="me?.user" label="Account" placement="up">
          <template #trigger>
            <span class="avatar" aria-hidden="true">{{ initials(me.user.name) }}</span>
            <span class="switch-text">
              <span class="switch-project">{{ me.user.name }}</span>
              <span class="switch-studio">{{ current ? `${ROLE_LABEL[current.role]} · ${current.studio.name}` : me.user.email }}</span>
            </span>
            <UiIcon name="chevrons" :size="16" class="switch-icon" />
          </template>
          <div class="menu-label">{{ me.user.email }}</div>
          <NuxtLink to="/settings" class="menu-item"><UiIcon name="settings" :size="16" />Studio settings</NuxtLink>
          <NuxtLink to="/settings/team" class="menu-item"><UiIcon name="team" :size="16" />{{ canManage(me) ? 'Invite teammates' : 'Team' }}</NuxtLink>
          <hr class="menu-sep">
          <button type="button" class="menu-item" @click="logOut"><UiIcon name="logout" :size="16" />Log out</button>
        </UiMenu>
      </div>
    </aside>

    <main class="shell" :inert="navOpen">
      <p v-if="current?.role === 'viewer'" class="notice info viewer-note">
        <UiIcon name="lock" :size="16" />
        <span><b>View only.</b> You can read everything in {{ current.project.name }} and ask canon questions. Ask a studio owner or admin if you need to review or change canon.</span>
      </p>
      <slot />
    </main>

    <!-- Phones: the five core sections stay one tap away; More opens the drawer with the rest. -->
    <nav class="bottom-nav" aria-label="Sections" :inert="navOpen">
      <NuxtLink v-for="l in bottomLinks" :key="l.to" :to="l.to" class="bottom-link" :class="{ 'router-link-exact-active': l.to !== '/' && route.path.startsWith(`${l.to}/`) }">
        <span class="bottom-icon"><UiIcon :name="l.icon" :size="22" /><span v-if="l.count && l.tone" class="bottom-badge" :class="l.tone">{{ l.count > 99 ? '99+' : l.count }}</span></span>
        <span>{{ l.label }}</span>
      </NuxtLink>
      <button type="button" class="bottom-link" :aria-expanded="navOpen" aria-controls="sidebar" @click="navOpen = true">
        <span class="bottom-icon"><UiIcon name="menu" :size="22" /><span v-if="stats?.open_conflicts" class="bottom-badge bad dot" /></span>
        <span>More</span>
        <span v-if="stats?.open_conflicts" class="sr-only">({{ counted(stats.open_conflicts, 'open conflict') }})</span>
      </button>
    </nav>
    <MentionCard />
    <GuidedTour />
  </div>
</template>

<style scoped>
.switcher { margin: calc(-1 * var(--s-2)) 0 calc(-1 * var(--s-1)); }
.switcher :deep(.menu-trigger) { border-color: var(--line); background: var(--raised); padding: 7px 10px; }
.switcher :deep(.menu-trigger:hover), .switcher :deep(.menu-trigger[aria-expanded=true]) { border-color: var(--line-strong); background: var(--raised); }
.switch-text { display: grid; flex: 1; min-width: 0; line-height: 1.3; }
.switch-studio { font-size: var(--text-xs); color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.switch-project { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.switch-icon { flex: none; color: var(--faint); }
.menu-grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-item[aria-current] { font-weight: 600; }
.menu-check { color: var(--accent) !important; }
.sidebar-foot { margin-top: auto; display: grid; gap: var(--s-2); }
.sidebar-foot .model-status { margin-top: 0; }
.avatar { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: var(--text-xs); font-weight: 700; }
.viewer-note { margin-bottom: var(--s-5); }
.viewer-note svg { flex: none; margin-top: 2px; }
.topbar-name { overflow: hidden; text-overflow: ellipsis; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
