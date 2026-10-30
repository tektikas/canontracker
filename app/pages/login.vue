<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Log in · Story Bible' })
const route = useRoute()
const form = reactive({ email: '', password: '' })
const error = ref('')
const busy = ref(false)
const forgot = ref(false)
const redirect = computed(() => safeRedirect(route.query.redirect))
const inviting = computed(() => redirect.value.startsWith('/invite/'))

async function submit() {
  error.value = ''
  if (!form.email.trim() || !form.password) {
    error.value = 'Enter your email and password.'
    return
  }
  busy.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: form })
    await loadMe()
    await navigateTo(redirect.value)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-card">
    <h1>Log in</h1>
    <p class="muted lead">{{ inviting ? 'Log in to accept your invite.' : 'Welcome back. Pick up where your team left off.' }}</p>

    <form class="panel stack form" novalidate @submit.prevent="submit">
      <UiField label="Email">
        <input v-model="form.email" type="email" autocomplete="email" required autofocus>
      </UiField>
      <UiField label="Password">
        <input v-model="form.password" type="password" autocomplete="current-password" required>
      </UiField>
      <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
      <UiButton type="submit" variant="primary" size="lg" :loading="busy">Log in</UiButton>
      <button type="button" class="link-btn small" :aria-expanded="forgot" @click="forgot = !forgot">Forgot your password?</button>
      <p v-if="forgot" class="small muted forgot">Password reset by email isn’t available yet. Contact your studio owner and they’ll help you get back in.</p>
    </form>

    <p class="small muted switch">
      New to Story Bible? <NuxtLink :to="{ path: '/signup', query: inviting ? { invite: redirect.split('/').pop() } : {} }">Create an account</NuxtLink>
    </p>
  </div>
</template>

<style scoped>
.auth-card h1 { margin-bottom: var(--s-1); }
.lead { margin-bottom: var(--s-5); }
.form { gap: var(--s-4); padding: var(--s-5); }
.form .btn { width: 100%; }
.link-btn { justify-self: center; border: 0; background: none; padding: 4px; color: var(--accent); font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.forgot { margin: 0; text-align: center; }
.switch { text-align: center; margin-top: var(--s-4); }
</style>
