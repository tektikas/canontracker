<script setup lang="ts">
// Public site shell: top nav with two dropdowns (desktop) or one menu sheet (phones), and a footer listing every page.
const me = useMe()
const route = useRoute()
const menuOpen = ref(false)
const nav = ref<HTMLElement>()
const menuButton = ref<HTMLButtonElement>()

// Dropdowns are native <details> sharing one name, so only one is open; close them and the phone menu on navigation.
const closeAll = () => {
  nav.value?.querySelectorAll('details[open]').forEach(d => d.removeAttribute('open'))
  menuOpen.value = false
}
watch(() => route.fullPath, closeAll)
const onDocClick = (e: MouseEvent) => { if (!nav.value?.contains(e.target as Node)) nav.value?.querySelectorAll('details[open]').forEach(d => d.removeAttribute('open')) }
const onKey = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  if (menuOpen.value) { menuOpen.value = false; menuButton.value?.focus() }
  closeAll()
}
onMounted(() => { document.addEventListener('click', onDocClick); document.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onKey) })

const FOOTER = [
  { title: 'Product', links: [{ to: '/features', label: 'Features' }, ...PILLARS.map(p => ({ to: `/features/${p.slug}`, label: p.title }))] },
  { title: 'Use cases', links: USE_CASES.map(u => ({ to: `/use-cases/${u.slug}`, label: u.nav })) },
  { title: 'Story Bible', links: [{ to: '/agents', label: 'AI agents and MCP' }, { to: '/security', label: 'Security' }, { to: '/pricing', label: 'Pricing' }, { to: '/changelog', label: 'Changelog' }, { to: '/about', label: 'About' }] },
]
</script>

<template>
  <div class="mk">
    <a href="#main" class="skip">Skip to content</a>
    <header ref="nav" class="mk-top">
      <div class="mk-bar">
        <NuxtLink to="/" class="brand"><BrandMark />Story Bible</NuxtLink>

        <nav class="mk-nav" aria-label="Site">
          <details name="mk-nav" class="dd">
            <summary>Product<UiIcon name="down" :size="14" /></summary>
            <div class="dd-panel wide">
              <NuxtLink to="/features" class="dd-all">
                <b>All features</b>
                <span>From your first document to a shared story bible</span>
              </NuxtLink>
              <ul class="dd-grid">
                <li v-for="p in PILLARS" :key="p.slug">
                  <NuxtLink :to="`/features/${p.slug}`"><b>{{ p.title }}</b><span>{{ p.short }}</span></NuxtLink>
                </li>
              </ul>
            </div>
          </details>
          <details name="mk-nav" class="dd">
            <summary>Use cases<UiIcon name="down" :size="14" /></summary>
            <div class="dd-panel">
              <ul class="dd-list">
                <li v-for="u in USE_CASES" :key="u.slug"><NuxtLink :to="`/use-cases/${u.slug}`">{{ u.nav }}</NuxtLink></li>
              </ul>
            </div>
          </details>
          <NuxtLink to="/agents" class="nl">AI agents</NuxtLink>
          <NuxtLink to="/security" class="nl">Security</NuxtLink>
          <NuxtLink to="/pricing" class="nl">Pricing</NuxtLink>
        </nav>

        <div class="mk-actions">
          <ThemeToggle />
          <template v-if="me?.user">
            <UiButton to="/" variant="primary">Open the app</UiButton>
          </template>
          <template v-else>
            <NuxtLink to="/login" class="btn ghost login">Log in</NuxtLink>
            <UiButton to="/signup" variant="primary">Start free</UiButton>
          </template>
          <button ref="menuButton" type="button" class="icon-btn menu-btn" :aria-expanded="menuOpen" aria-controls="mk-menu" @click="menuOpen = !menuOpen">
            <UiIcon :name="menuOpen ? 'close' : 'menu'" :size="20" :label="menuOpen ? 'Close menu' : 'Open menu'" />
          </button>
        </div>
      </div>

      <nav v-show="menuOpen" id="mk-menu" class="mk-menu" aria-label="Site">
        <div v-for="g in FOOTER" :key="g.title" class="menu-group">
          <h2>{{ g.title }}</h2>
          <NuxtLink v-for="l in g.links" :key="l.to" :to="l.to">{{ l.label }}</NuxtLink>
        </div>
        <NuxtLink v-if="!me?.user" to="/login" class="btn">Log in</NuxtLink>
      </nav>
    </header>

    <main id="main">
      <slot />
    </main>

    <footer class="mk-foot">
      <div class="foot-inner">
        <div class="foot-brand">
          <NuxtLink to="/" class="brand"><BrandMark />Story Bible</NuxtLink>
          <p>A story builder with canon you can cite. Open source under AGPL-3.0, built for the Meta AI Developer Hackathon.</p>
          <p class="foot-links"><a :href="GITHUB">Source on GitHub</a><a :href="LICENSE_URL">License</a><a :href="CONTACT">info@tektik.ai</a></p>
        </div>
        <nav v-for="g in FOOTER" :key="g.title" class="foot-col" :aria-label="g.title">
          <h2>{{ g.title }}</h2>
          <NuxtLink v-for="l in g.links" :key="l.to" :to="l.to">{{ l.label }}</NuxtLink>
        </nav>
      </div>
      <p class="foot-note">The samples Broken Tide, Lantern Row and The Ashbell Pass are original, synthetic stories written for Story Bible.</p>
    </footer>
  </div>
</template>

<style scoped>
.mk { --mk-max: 1200px; --mk-pad: 40px; min-height: 100vh; display: flex; flex-direction: column; }
#main { flex: 1; }
.skip { position: absolute; left: -9999px; top: 8px; z-index: 30; padding: 8px 12px; background: var(--raised); border: 1px solid var(--line-strong); border-radius: var(--r-md); }
.skip:focus { left: 16px; }

.mk-top { position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--canvas) 94%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
.mk-bar { max-width: var(--mk-max); margin: 0 auto; padding: 10px var(--mk-pad); display: flex; align-items: center; gap: var(--s-5); }
.mk-nav { display: flex; align-items: center; gap: 2px; flex: 1; }
.mk-actions { display: flex; align-items: center; gap: var(--s-2); }
.nl, .dd summary { display: inline-flex; align-items: center; gap: 4px; min-height: 40px; padding: 0 12px; border-radius: var(--r-md); color: var(--muted); font-weight: 500; text-decoration: none; cursor: pointer; list-style: none; }
.dd summary::-webkit-details-marker { display: none; }
.nl:hover, .dd summary:hover, .dd[open] summary { color: var(--ink); background: var(--sunken); }
.nl.router-link-active { color: var(--ink); }
.nl:focus-visible, .dd summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.dd { position: relative; }
.dd[open] summary :deep(svg) { transform: rotate(180deg); }
.dd-panel { position: absolute; top: calc(100% + 8px); left: 0; z-index: 25; min-width: 220px; padding: var(--s-2); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--elev-overlay); }
.dd-panel.wide { width: 620px; display: grid; gap: var(--s-2); }
.dd-panel a { display: grid; gap: 2px; padding: 10px 12px; border-radius: var(--r-md); color: var(--ink); text-decoration: none; }
.dd-panel a:hover, .dd-panel a:focus-visible { background: var(--sunken); }
.dd-panel a span { color: var(--muted); font-size: var(--text-sm); line-height: 1.45; }
.dd-panel b { font-weight: 600; }
.dd-all { border-bottom: 1px solid var(--line); border-radius: var(--r-md) var(--r-md) 0 0 !important; }
.dd-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }
.dd-list { list-style: none; margin: 0; padding: 0; }
.menu-btn { display: none; width: 44px; height: 44px; }

.mk-menu { max-width: var(--mk-max); margin: 0 auto; padding: var(--s-2) var(--mk-pad) var(--s-5); display: grid; gap: var(--s-4); max-height: calc(100dvh - 60px); overflow-y: auto; }
.menu-group { display: grid; }
.menu-group h2 { font-size: var(--text-sm); color: var(--faint); font-weight: 600; margin: 0 0 var(--s-1); }
.menu-group a { display: flex; align-items: center; min-height: 44px; color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--line); }

.mk-foot { margin-top: var(--s-7); background: var(--surface); border-top: 1px solid var(--line); }
.foot-inner { max-width: var(--mk-max); margin: 0 auto; padding: var(--s-7) var(--mk-pad) var(--s-6); display: grid; grid-template-columns: 1.4fr repeat(3, 1fr); gap: var(--s-6); }
.foot-brand p { color: var(--muted); max-width: 36ch; margin: var(--s-3) 0 0; }
.foot-links { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); }
.foot-links a { color: var(--accent); }
.foot-col { display: grid; align-content: start; gap: 2px; }
.foot-col h2 { font-size: var(--text-base); margin: 0 0 var(--s-2); }
.foot-col a { color: var(--muted); text-decoration: none; padding: 4px 0; }
.foot-col a:hover { color: var(--ink); text-decoration: underline; }
.foot-note { max-width: var(--mk-max); margin: 0 auto; padding: var(--s-4) var(--mk-pad) var(--s-6); border-top: 1px solid var(--line); color: var(--faint); font-size: var(--text-sm); }

@media (max-width: 960px) {
  .mk-nav, .login { display: none; }
  .mk-bar { justify-content: space-between; }
  .menu-btn { display: inline-grid; }
  .foot-inner { grid-template-columns: 1fr 1fr; }
  .foot-brand { grid-column: 1 / -1; }
}
@media (max-width: 720px) { .mk { --mk-pad: 16px; } }
@media (max-width: 520px) {
  .foot-inner { grid-template-columns: 1fr; gap: var(--s-5); }
}
@media (min-width: 961px) { .mk-menu { display: none !important; } }
</style>
