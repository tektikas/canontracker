<script setup lang="ts">
// "Try the demo": makes a guest account with three demo projects (POST /api/auth/guest), then opens Broken Tide's Home with
// the guided tour. A full reload, like onboarding's demo, so the shell starts from the new session.
withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg', variant?: 'primary' | 'secondary' }>(), { size: 'lg', variant: 'secondary' })
const busy = ref(false)
const error = ref('')
async function start() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/guest', { method: 'POST' })
    reloadNuxtApp({ path: '/?tour=1', force: true })
  } catch (e) {
    error.value = errorMessage(e)
    busy.value = false
  }
}
</script>

<template>
  <UiButton :variant="variant" :size="size" icon="demo" :loading="busy" @click="start">{{ busy ? 'Setting up your demo…' : 'Try the demo' }}</UiButton>
  <p v-if="error" class="notice bad small try-error" role="alert">{{ error }}</p>
</template>

<style scoped>
.try-error { flex-basis: 100%; margin: 0; }
</style>
