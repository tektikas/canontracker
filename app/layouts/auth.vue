<script setup lang="ts">
// Log-in, sign-up, onboarding and invite pages: one narrow column, the brand and nothing else to click away to.
const me = useMe()
</script>

<template>
  <div class="auth">
    <header class="auth-top">
      <NuxtLink to="/" class="brand"><BrandMark />Story Bible</NuxtLink>
      <span class="auth-actions">
        <HelpButton />
        <button v-if="me?.user" type="button" class="btn ghost sm" @click="logOut">Log out</button>
      </span>
    </header>
    <main class="auth-main">
      <slot />
    </main>
    <footer class="auth-foot small faint">Story Bible · a story builder with human-approved, source-cited canon</footer>
  </div>
</template>

<style scoped>
.auth { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-rows: auto 1fr auto; }
.auth-top { display: flex; align-items: center; justify-content: space-between; padding: var(--s-4) var(--s-5); }
.auth-actions { display: flex; align-items: center; gap: var(--s-2); }
.auth-main { display: grid; justify-items: center; align-content: start; padding: var(--s-6) var(--s-4) var(--s-7); }
.auth-main > :deep(*) { width: 100%; max-width: 440px; }
.auth-foot { text-align: center; padding: var(--s-4); }
@media (min-height: 760px) { .auth-main { padding-top: 8vh; } }
@media (max-width: 720px) { .auth-top { padding: var(--s-3) var(--s-4); } .auth-main { padding-top: var(--s-4); } }
</style>
