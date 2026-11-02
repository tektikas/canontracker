<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Create your account · Story Bible' })
const route = useRoute()
const invite = computed(() => (typeof route.query.invite === 'string' ? route.query.invite : ''))
const { data: inviteInfo } = await useFetch(() => `/api/invites/${invite.value}`, { immediate: !!invite.value, key: `invite-${invite.value}` })
const form = reactive({ name: '', email: '', password: '' })
const errors = reactive({ name: '', email: '', password: '', form: '' })
const busy = ref(false)

function validate() {
  errors.name = form.name.trim() ? '' : 'Enter your name, so your team knows who decided what.'
  errors.email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? '' : 'Enter a valid email address.'
  errors.password = form.password.length >= 8 ? '' : 'Use at least 8 characters.'
  return !errors.name && !errors.email && !errors.password
}

async function submit() {
  errors.form = ''
  if (!validate()) return
  busy.value = true
  try {
    await $fetch('/api/auth/signup', { method: 'POST', body: form })
    await loadMe()
    await navigateTo(invite.value ? `/invite/${invite.value}` : '/onboarding')
  } catch (e) {
    errors.form = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-card">
    <h1>{{ inviteInfo?.status === 'valid' ? `Join ${inviteInfo.studio_name}` : 'Create your account' }}</h1>
    <p class="muted lead">
      <template v-if="inviteInfo?.status === 'valid'">{{ inviteInfo.created_by_name }} invited you as {{ ROLE_LABEL[inviteInfo.role as Role].toLowerCase() }}. Create your account to accept.</template>
      <template v-else>Set up your studio in a minute. You can try it on a sample story before importing your own lore.</template>
    </p>

    <form class="panel stack form" novalidate @submit.prevent="submit">
      <UiField label="Your name" :error="errors.name" hint="Shown next to every decision you make.">
        <input v-model="form.name" type="text" autocomplete="name" required autofocus>
      </UiField>
      <UiField label="Work email" :error="errors.email">
        <input v-model="form.email" type="email" autocomplete="email" required>
      </UiField>
      <UiField label="Password" :error="errors.password" hint="At least 8 characters.">
        <input v-model="form.password" type="password" autocomplete="new-password" required minlength="8">
      </UiField>
      <p v-if="errors.form" class="notice bad" role="alert">
        <span v-if="errors.form.includes('already exists')">An account with this email already exists. <NuxtLink :to="{ path: '/login', query: invite ? { redirect: `/invite/${invite}` } : {} }">Log in instead</NuxtLink>.</span>
        <span v-else>{{ errors.form }}</span>
      </p>
      <UiButton type="submit" variant="primary" size="lg" :loading="busy">Create account</UiButton>
    </form>

    <p class="small muted switch">
      Already have an account? <NuxtLink :to="{ path: '/login', query: invite ? { redirect: `/invite/${invite}` } : {} }">Log in</NuxtLink>
    </p>
  </div>
</template>

<style scoped>
.auth-card h1 { margin-bottom: var(--s-1); }
.lead { margin-bottom: var(--s-5); }
.form { gap: var(--s-4); padding: var(--s-5); }
.form .btn { width: 100%; }
.switch { text-align: center; margin-top: var(--s-4); }
</style>
