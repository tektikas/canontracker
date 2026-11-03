<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const route = useRoute()
const token = String(route.params.token)
const me = useMe()
const { data: invite, error: loadError } = await useFetch(`/api/invites/${token}`, { key: `invite-${token}` })
useHead({ title: () => (invite.value ? `Join ${invite.value.studio_name} · CanonTracker` : 'Invite · CanonTracker') })
const busy = ref(false)
const error = ref('')
const expires = computed(() => invite.value && shortDate(invite.value.expires_at))
const role = computed(() => (invite.value?.role ?? 'viewer') as Role)

async function join() {
  busy.value = true
  error.value = ''
  try {
    const r = await $fetch(`/api/invites/${token}/accept`, { method: 'POST' })
    reloadNuxtApp({ path: r.project_id ? '/' : '/onboarding', force: true })
  } catch (e) {
    error.value = errorMessage(e)
    busy.value = false
  }
}
const open = () => join() // already a member: accept only switches into the studio
</script>

<template>
  <div class="invite">
    <div v-if="loadError || !invite" class="stack">
      <h1>This invite link doesn’t work</h1>
      <p class="muted">It may have been mistyped or copied only in part. Ask the person who sent it for a new link.</p>
      <UiButton :to="me?.user ? '/' : '/login'" variant="primary">{{ me?.user ? 'Go to CanonTracker' : 'Log in' }}</UiButton>
    </div>

    <div v-else-if="invite.member" class="stack">
      <h1>You’re already in {{ invite.studio_name }}</h1>
      <p class="muted">Your account is already a member of this studio, so there’s nothing to accept.</p>
      <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
      <UiButton variant="primary" :loading="busy" @click="open">Open {{ invite.studio_name }}</UiButton>
    </div>

    <div v-else-if="invite.status !== 'valid'" class="stack">
      <h1>This invite has {{ invite.status === 'used' ? 'already been used' : invite.status === 'expired' ? 'expired' : 'been revoked' }}</h1>
      <p class="muted">Invite links work once and only until they expire. Ask {{ invite.created_by_name }} at {{ invite.studio_name }} to send you a new one.</p>
      <UiButton :to="me?.user ? '/' : '/login'">{{ me?.user ? 'Go to CanonTracker' : 'Log in' }}</UiButton>
    </div>

    <div v-else class="stack">
      <span class="kicker">Invitation</span>
      <h1>Join {{ invite.studio_name }}</h1>
      <p class="muted">{{ invite.created_by_name }} invited you to join {{ invite.studio_name }} on CanonTracker, where the team keeps its story canon.</p>

      <div class="panel role-card">
        <div class="spread">
          <span class="small muted">Your role</span>
          <UiBadge tone="accent">{{ ROLE_LABEL[role] }}</UiBadge>
        </div>
        <p class="small role-help">{{ ROLE_HELP[role] }}</p>
        <p class="small faint">Link expires {{ expires }} and works once.</p>
      </div>

      <template v-if="me?.user">
        <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
        <UiButton variant="primary" size="lg" :loading="busy" @click="join">Join as {{ me.user.name }}</UiButton>
        <p class="small muted center">Not {{ me.user.name }}? <button type="button" class="link-btn" @click="logOut">Log out</button> and open the link again.</p>
      </template>
      <template v-else>
        <UiButton variant="primary" size="lg" :to="`/signup?invite=${token}`">Create an account to join</UiButton>
        <UiButton size="lg" :to="`/login?redirect=/invite/${token}`">I already have an account</UiButton>
      </template>
    </div>
  </div>
</template>

<style scoped>
.invite .stack { gap: var(--s-4); }
.invite h1 { margin: 0; }
.invite p { margin: 0; }
.invite .btn { width: 100%; }
.kicker { font-size: var(--text-xs); font-weight: 600; color: var(--accent); }
.role-card { display: grid; gap: var(--s-2); }
.role-help { color: var(--ink); }
.center { text-align: center; }
.link-btn { border: 0; background: none; padding: 0; color: var(--accent); font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
</style>
