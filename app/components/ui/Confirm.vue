<script setup lang="ts">
// Host for askConfirm(): one per app (app.vue). Esc, the backdrop and × answer "no".
const req = useConfirmRequest()
const open = computed({ get: () => !!req.value, set: (v) => { if (!v) answer(false) } })
function answer(ok: boolean) {
  const r = req.value
  if (!r) return
  req.value = null
  r.resolve(ok)
}
</script>

<template>
  <UiDialog v-model:open="open" :title="req?.title ?? ''" @submit="answer(true)">
    <p v-if="req?.body">{{ req.body }}</p>
    <template #actions>
      <UiButton variant="ghost" :autofocus="!!req?.danger" @click="answer(false)">{{ req?.cancel ?? 'Cancel' }}</UiButton>
      <!-- A danger confirm is not a primary action: no submit button, so Ctrl/⌘+Enter does nothing there. -->
      <UiButton v-if="req?.danger" variant="danger" autofocus @click="answer(true)">{{ req?.confirm }}</UiButton>
      <UiButton v-else type="submit" variant="primary" autofocus>{{ req?.confirm }}<UiSendKey /></UiButton>
    </template>
  </UiDialog>
</template>
