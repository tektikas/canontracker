<script setup lang="ts">
import type { IconName } from '~/components/ui/Icon.vue'

const me = useMe()
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const { data: entities } = await useEntityList()
await useEntityTypes()
const route = useRoute()
const navOpen = ref(false)
const paletteOpen = usePaletteOpen()
const mac = ref(false)
onMounted(() => { mac.value = /Mac|iPhone|iPad/.test(navigator.platform) })
watch(paletteOpen, (o) => { if (o) navOpen.value = false })
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

// "2 hard · 3 soft" for the open conflicts; shared wording with Home and the Conflicts header.
const severityCounts = (s?: { open_hard: number, open_soft: number } | null) => s && (s.open_hard || s.open_soft)
  ? [s.open_hard && `${s.open_hard} hard`, s.open_soft && `${s.open_soft} soft`].filter(Boolean).join(' · ') : undefined

interface NavLink { to: string, label: string, icon: IconName, count?: number, tone?: 'accent' | 'bad', sub?: string }
const groups = computed<{ label?: string, links: NavLink[] }[]>(() => [
  { links: [{ to: '/', label: 'Home', icon: 'home' }, { to: '/library', label: 'Library', icon: 'library', count: stats.value?.documents || undefined }] },
  {
    label: 'Workflow',
    links: [
      { to: '/review', label: 'Review', icon: 'review', count: stats.value?.pending || undefined, tone: 'accent' },
      { to: '/canon', label: 'Canon', icon: 'canon', count: stats.value?.canon || undefined },
      { to: '/entities', label: 'Entities', icon: 'entities', count: entities.value?.length || undefined },
      { to: '/conflicts', label: 'Conflicts', icon: 'conflicts', count: stats.value?.open_conflicts || undefined, tone: 'bad', sub: severityCounts(stats.value) },
      { to: '/changes', label: 'Changes', icon: 'changes', count: stats.value?.changes || undefined },
      { to: '/tasks', label: 'Tasks', icon: 'tasks', count: stats.value?.open_tasks || undefined },
      { to: '/notes', label: 'Notes', icon: 'note', count: stats.value?.open_notes || undefined },
    ],
  },
  {
    label: 'Tools',
    links: [
      { to: '/ask', label: 'Ask', icon: 'ask' },
      { to: '/metrics', label: 'Metrics', icon: 'metrics' },
      { to: '/audit', label: 'Audit log', icon: 'audit' },
      { to: '/export', label: 'Export & share', icon: 'link' },
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

// Chat: the drawer everywhere but /ask (which is the chat), ⌘/Ctrl+J and the floating button (bottom nav on phones).
// A page with its own docked chat (reader, writer, /ask itself) takes the request instead, and hides the button.
const chat = useChat()
const onAsk = computed(() => route.path === '/ask')
function toggleChat() {
  if (onAsk.value || chat.value.dock || !chat.value.open) return openChat()
  chat.value.open = false
}
function chatKey(e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'j') return
  e.preventDefault()
  toggleChat()
}
watch(onAsk, (on) => { if (on) chat.value.open = false })
onMounted(() => window.addEventListener('keydown', chatKey))
onBeforeUnmount(() => window.removeEventListener('keydown', chatKey))
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
      <button class="icon-btn" type="button" aria-label="Search" aria-haspopup="dialog" @click="paletteOpen = true"><UiIcon name="search" :size="20" /></button>
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

      <button type="button" class="search-btn" aria-haspopup="dialog" @click="paletteOpen = true">
        <UiIcon name="search" :size="16" /><span class="search-label">Search</span><kbd>{{ mac ? '⌘K' : 'Ctrl K' }}</kbd>
      </button>

      <nav class="nav" aria-label="Main">
        <div v-for="(g, i) in groups" :key="i" class="nav-group">
          <div v-if="g.label" class="nav-group-label">{{ g.label }}</div>
          <template v-for="l in g.links" :key="l.to"><NuxtLink :to="l.to" class="nav-link" :class="{ 'router-link-exact-active': l.to !== '/' && route.path.startsWith(`${l.to}/`) }">
            <UiIcon :name="l.icon" />
            <span class="nav-label">{{ l.label }}</span>
            <span v-if="l.count" class="nav-count" :class="l.tone">{{ l.count }}</span>
          </NuxtLink>
          <div v-if="l.sub" class="nav-sub">{{ l.sub }}</div></template>
        </div>
      </nav>

      <div class="sidebar-foot">
        <UiMenu v-if="me?.user" label="Account">
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

    <!-- Phones: the core sections and Ask stay one tap away; More opens the drawer with the rest. -->
    <nav class="bottom-nav" aria-label="Sections" :inert="navOpen">
      <NuxtLink v-for="l in bottomLinks" :key="l.to" :to="l.to" class="bottom-link" :class="{ 'router-link-exact-active': l.to !== '/' && route.path.startsWith(`${l.to}/`) }">
        <span class="bottom-icon"><UiIcon :name="l.icon" :size="22" /><span v-if="l.count && l.tone" class="bottom-badge" :class="l.tone">{{ l.count > 99 ? '99+' : l.count }}</span></span>
        <span>{{ l.label }}</span>
      </NuxtLink>
      <button type="button" class="bottom-link" :class="{ 'router-link-exact-active': chat.open || onAsk }" :aria-pressed="chat.open" @click="toggleChat">
        <span class="bottom-icon"><UiIcon name="ask" :size="22" /></span>
        <span>Ask</span>
      </button>
      <button type="button" class="bottom-link" :aria-expanded="navOpen" aria-controls="sidebar" @click="navOpen = true">
        <span class="bottom-icon"><UiIcon name="menu" :size="22" /><span v-if="stats?.open_conflicts" class="bottom-badge bad dot" /></span>
        <span>More</span>
        <span v-if="stats?.open_conflicts" class="sr-only">({{ counted(stats.open_conflicts, 'open conflict') }})</span>
      </button>
    </nav>
    <button v-if="!chat.open && !chat.dock" type="button" class="chat-fab" :title="`Ask (${mac ? '⌘J' : 'Ctrl+J'})`" @click="toggleChat">
      <UiIcon name="ask" :size="20" /><span>Ask</span>
    </button>
    <ChatDrawer />
    <CommandPalette />
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
.avatar { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: var(--text-xs); font-weight: 700; }
.search-btn { display: flex; align-items: center; gap: var(--s-2); width: 100%; min-height: 34px; padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); color: var(--muted); font: inherit; cursor: pointer; }
.search-btn:hover { border-color: var(--line-strong); color: var(--ink); }
.search-label { flex: 1; text-align: left; }
.viewer-note { margin-bottom: var(--s-5); }
.viewer-note svg { flex: none; margin-top: 2px; }
.topbar-name { overflow: hidden; text-overflow: ellipsis; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.chat-fab {
  position: fixed; right: var(--s-5); bottom: var(--s-5); z-index: 20; display: inline-flex; align-items: center; gap: var(--s-2);
  min-height: 44px; padding: 0 var(--s-4) 0 var(--s-3); border: 1px solid var(--accent-strong); border-radius: 999px;
  background: var(--accent); color: var(--accent-ink); font: 600 var(--text-base) var(--font-ui); box-shadow: var(--elev-overlay); cursor: pointer;
}
.chat-fab:hover { background: var(--accent-strong); }
@media (max-width: 720px) { .chat-fab { display: none; } }
.nav-sub { margin: -2px 0 4px calc(var(--s-3) + 28px); font-size: var(--text-xs); color: var(--faint); }
</style>
