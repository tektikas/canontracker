<script setup lang="ts">
const me = useMe()
const TABS = [{ to: '/settings', label: 'Studio' }, { to: '/settings/profile', label: 'Profile' }, { to: '/settings/team', label: 'Team' }, { to: '/settings/projects', label: 'Projects' }, { to: '/settings/agents', label: 'Agents & API' }]
</script>

<template>
  <UiPageHeader title="Studio settings" :description="`${me?.current?.studio.name} · you are ${ROLE_LABEL[me?.current?.role ?? 'viewer'].toLowerCase()}`" />
  <nav class="tabs link-tabs" aria-label="Studio settings">
    <NuxtLink v-for="t in TABS" :key="t.to" :to="t.to" class="link-tab" exact-active-class="active">{{ t.label }}</NuxtLink>
  </nav>
  <NuxtPage />
</template>

<style scoped>
.link-tabs { margin-bottom: var(--s-5); }
.link-tab { position: relative; padding: 10px 12px; font-weight: 500; color: var(--muted); text-decoration: none; white-space: nowrap; }
.link-tab:hover { color: var(--ink); }
.link-tab.active { color: var(--ink); }
/* On phones the last tab runs past the edge: fade it so the row reads as scrollable. */
@media (max-width: 720px) { .link-tabs { mask-image: linear-gradient(to right, #000 82%, transparent); padding-right: 24px; } }
.link-tab.active::after { content: ""; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; border-radius: 2px 2px 0 0; background: var(--accent); }
</style>
