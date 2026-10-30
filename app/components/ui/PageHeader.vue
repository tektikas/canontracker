<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <header class="page-head">
    <div>
      <h1>{{ title }}</h1>
      <p v-if="description || $slots.default"><slot>{{ description }}</slot></p>
    </div>
    <div v-if="$slots.actions" class="page-actions"><slot name="actions" /></div>
  </header>
</template>
