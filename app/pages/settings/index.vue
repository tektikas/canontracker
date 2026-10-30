<script setup lang="ts">
useHead({ title: 'Studio settings · Story Bible' })
const me = useMe()
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

    <UiPanel title="Your account">
      <dl class="facts">
        <dt>Name</dt><dd>{{ me?.user?.name }}</dd>
        <dt>Email</dt><dd>{{ me?.user?.email }}</dd>
        <dt>Role in this studio</dt><dd><UiBadge tone="accent">{{ ROLE_LABEL[me?.current?.role ?? 'viewer'] }}</UiBadge> <span class="small muted">{{ ROLE_HELP[me?.current?.role ?? 'viewer'] }}</span></dd>
      </dl>
      <p class="small faint">Changing your name, email or password isn’t available yet. Contact your studio owner if something needs fixing.</p>
    </UiPanel>
  </div>
</template>

<style scoped>
.studio-form { max-width: 420px; }
.good-text { display: inline-flex; align-items: center; gap: 4px; color: var(--good); font-weight: 500; }
input:disabled { background: var(--sunken); color: var(--muted); cursor: not-allowed; }
.facts { display: grid; grid-template-columns: 160px 1fr; gap: var(--s-2) var(--s-4); margin: 0 0 var(--s-4); }
.facts dt { color: var(--muted); font-size: var(--text-sm); }
.facts dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 720px) { .facts { grid-template-columns: 1fr; gap: 2px; } .facts dd { margin-bottom: var(--s-2); } }
</style>
