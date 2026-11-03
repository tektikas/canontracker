<script setup lang="ts">
useHead({ title: 'Profile · CanonTracker' })
const me = useMe()

const profile = reactive({ name: me.value?.user?.name ?? '', email: me.value?.user?.email ?? '' })
const pBusy = ref(false)
const pError = ref('')
const pSaved = ref(false)
const pDirty = computed(() => profile.name.trim() !== me.value?.user?.name || profile.email.trim().toLowerCase() !== me.value?.user?.email)

async function saveProfile() {
  pBusy.value = true
  pError.value = ''
  pSaved.value = false
  try {
    const r = await $fetch('/api/account/profile', { method: 'PATCH', body: profile })
    profile.name = r.name
    profile.email = r.email
    await loadMe()
    pSaved.value = true
  } catch (e) {
    pError.value = errorMessage(e)
  } finally {
    pBusy.value = false
  }
}

const pw = reactive({ current: '', next: '', again: '' })
const wBusy = ref(false)
const wError = ref('')
const wSaved = ref(false)
const strong = computed(() => pw.next.length >= 8)
const mismatch = computed(() => !!pw.again && pw.again !== pw.next)
const hint = computed(() => strong.value ? 'Good. Longer is better; a few unrelated words work well.' : `At least 8 characters. ${pw.next.length}/8`)

async function savePassword() {
  wBusy.value = true
  wError.value = ''
  wSaved.value = false
  try {
    await $fetch('/api/account/password', { method: 'POST', body: { current: pw.current, next: pw.next } })
    Object.assign(pw, { current: '', next: '', again: '' })
    wSaved.value = true
  } catch (e) {
    wError.value = errorMessage(e)
  } finally {
    wBusy.value = false
  }
}
</script>

<template>
  <div class="stack" style="gap: var(--s-5)">
    <UiPanel title="Your profile" description="Your name shows next to your decisions in the audit trail. Your email is how you log in.">
      <form class="stack narrow" @submit.prevent="saveProfile">
        <UiField label="Name"><input v-model="profile.name" type="text" maxlength="80" autocomplete="name" required @input="pSaved = false"></UiField>
        <UiField label="Email" :error="pError"><input v-model="profile.email" type="email" autocomplete="email" required @input="pSaved = false"></UiField>
        <dl class="role"><dt>Role in this studio</dt><dd><UiBadge tone="accent">{{ ROLE_LABEL[me?.current?.role ?? 'viewer'] }}</UiBadge> <span class="small muted">{{ ROLE_HELP[me?.current?.role ?? 'viewer'] }}</span></dd></dl>
        <div class="row">
          <UiButton type="submit" variant="primary" :loading="pBusy" :disabled="!pDirty || !profile.name.trim() || !profile.email.trim()">Save profile</UiButton>
          <span v-if="pSaved" class="small good-text" role="status"><UiIcon name="check" :size="14" /> Saved</span>
        </div>
      </form>
    </UiPanel>

    <UiPanel title="Change password" description="You stay signed in on this device.">
      <form class="stack narrow" @submit.prevent="savePassword">
        <input type="text" :value="me?.user?.email" autocomplete="username" hidden readonly>
        <UiField label="Current password"><input v-model="pw.current" type="password" autocomplete="current-password" required @input="wSaved = false"></UiField>
        <UiField label="New password" :hint="pw.next ? hint : 'At least 8 characters.'"><input v-model="pw.next" type="password" autocomplete="new-password" minlength="8" required @input="wSaved = false"></UiField>
        <UiField label="New password again" :error="mismatch ? 'The two passwords don’t match.' : wError"><input v-model="pw.again" type="password" autocomplete="new-password" required @input="wSaved = false"></UiField>
        <div class="row">
          <UiButton type="submit" variant="primary" :loading="wBusy" :disabled="!pw.current || !strong || pw.again !== pw.next">Change password</UiButton>
          <span v-if="wSaved" class="small good-text" role="status"><UiIcon name="check" :size="14" /> Password changed</span>
        </div>
        <p class="small faint">Other devices stay signed in: sign-in sessions can’t be revoked from here yet.</p>
      </form>
    </UiPanel>
  </div>
</template>

<style scoped>
.narrow { max-width: 420px; }
.good-text { display: inline-flex; align-items: center; gap: 4px; color: var(--good); font-weight: 500; }
.role { margin: 0; display: grid; gap: 2px; }
.role dt { color: var(--muted); font-size: var(--text-sm); }
.role dd { margin: 0; }
</style>
