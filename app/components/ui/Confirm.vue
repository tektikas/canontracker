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
  <UiDialog v-model:open="open" :title="req?.title ?? ''">
    <p v-if="req?.body">{{ req.body }}</p>
    <template #actions>
      <UiButton variant="ghost" :autofocus="!!req?.danger" @click="answer(false)">{{ req?.cancel ?? 'Cancel' }}</UiButton>
      <UiButton :variant="req?.danger ? 'danger' : 'primary'" :autofocus="!req?.danger" @click="answer(true)">{{ req?.confirm }}</UiButton>
    </template>
  </UiDialog>
</template>
