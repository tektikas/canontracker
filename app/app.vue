<script setup lang="ts">
// Dates switch from UTC to the reader's own time zone once hydration is done (app/utils/date.ts).
onMounted(() => { localDates.value = true })
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <UiConfirm />
</template>
