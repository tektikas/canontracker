<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <header class="page-head">
    <div>
      <h1>{{ title }}</h1>
      <div v-if="description || $slots.default" class="page-sub"><slot>{{ description }}</slot></div>
    </div>
    <div v-if="$slots.actions" class="page-actions"><slot name="actions" /></div>
  </header>
</template>
