<script setup lang="ts">
// Light / dark switch (app/composables/theme.ts). Both icons render and CSS shows the right one, so server and client agree.
</script>

<template>
  <button type="button" class="theme-toggle" title="Switch light / dark" aria-label="Switch between light and dark theme" @click="toggleTheme()">
    <UiIcon name="moon" :size="18" class="to-dark" />
    <UiIcon name="sun" :size="18" class="to-light" />
  </button>
</template>

<style scoped>
.theme-toggle { display: inline-grid; place-items: center; width: 36px; height: 36px; flex: none; border: 1px solid var(--line); border-radius: var(--r-md); background: transparent; color: var(--muted); cursor: pointer; }
.theme-toggle:hover { color: var(--ink); border-color: var(--line-strong); }
.theme-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.to-light { display: none; }
@media screen and (prefers-color-scheme: dark) { :root:not([data-theme=light]) .to-dark { display: none; } :root:not([data-theme=light]) .to-light { display: block; } }
:root[data-theme=dark] .to-dark { display: none; }
:root[data-theme=dark] .to-light { display: block; }
</style>
