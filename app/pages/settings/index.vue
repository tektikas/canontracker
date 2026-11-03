<script setup lang="ts">
useHead({ title: 'Studio settings · CanonTracker' })
const me = useMe()
const CONTACT = 'info@tektik.ai' // ponytail: hard-coded contact until there is a support address setting
const admin = computed(() => canManage(me.value))
const name = ref(me.value?.current?.studio.name ?? '')
const busy = ref(false)
const error = ref('')
const saved = ref(false)
const dirty = computed(() => name.value.trim() !== me.value?.current?.studio.name)

async function save() {
  busy.value = true
  error.value = ''
  saved.value = false
  try {
    await $fetch('/api/studios/current', { method: 'PATCH', body: { name: name.value } })
    await loadMe()
    saved.value = true
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="stack" style="gap: var(--s-5)">
    <UiPanel title="Studio" description="The name your team sees in the project switcher and on invite links.">
      <form class="stack studio-form" @submit.prevent="save">
        <UiField label="Studio name" :error="error" :hint="admin ? undefined : 'Only owners and admins can rename the studio.'">
          <input v-model="name" type="text" maxlength="80" :disabled="!admin" @input="saved = false">
        </UiField>
        <div v-if="admin" class="row">
          <UiButton type="submit" variant="primary" :loading="busy" :disabled="!dirty || !name.trim()">Save name</UiButton>
          <span v-if="saved" class="small good-text" role="status"><UiIcon name="check" :size="14" /> Saved</span>
        </div>
      </form>
    </UiPanel>

    <UiPanel title="Plan">
      <div class="plan">
        <div class="plan-head"><b>Free during the beta</b> <UiBadge tone="accent">Current plan</UiBadge></div>
        <ul class="plan-list">
          <li>Unlimited projects, sources, facts and team members</li>
          <li>Conflict checks, change impact and the audit trail</li>
          <li>Agent tokens for your own tools</li>
        </ul>
        <p class="small muted">No payment details are collected. We’ll tell you well before pricing starts.</p>
      </div>
    </UiPanel>

    <UiPanel title="Delete studio" class="danger-zone">
      <p class="small">Deleting a studio removes its projects, sources and canon for everyone in it. It can’t be undone, and the audit trail is append-only, so we do it by hand with you.</p>
      <UiButton variant="danger" :to="`mailto:${CONTACT}?subject=${encodeURIComponent(`Delete studio: ${me?.current?.studio.name}`)}`">Contact us to delete</UiButton>
    </UiPanel>
  </div>
</template>

<style scoped>
.studio-form { max-width: 420px; }
.good-text { display: inline-flex; align-items: center; gap: 4px; color: var(--good); font-weight: 500; }
input:disabled { background: var(--sunken); color: var(--muted); cursor: not-allowed; }
.plan { display: grid; gap: var(--s-3); }
.plan-head { display: flex; gap: var(--s-2); align-items: center; font-size: var(--text-lg, 1.1rem); }
.plan-list { margin: 0; padding-left: var(--s-5); display: grid; gap: var(--s-1); }
.plan p { margin: 0; }
.danger-zone { border-color: color-mix(in srgb, var(--bad) 40%, var(--line)); }
.danger-zone p { margin: 0 0 var(--s-3); max-width: 60ch; }
</style>
