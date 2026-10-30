<script setup lang="ts">
import type { IconName } from './Icon.vue'

// An empty screen says what is missing and offers the action that fills it.
defineProps<{ title: string, icon?: IconName }>()
</script>

<template>
  <div class="empty">
    <span v-if="icon" class="empty-icon"><UiIcon :name="icon" :size="20" /></span>
    <h3>{{ title }}</h3>
    <p v-if="$slots.default"><slot /></p>
    <div v-if="$slots.actions" class="row"><slot name="actions" /></div>
  </div>
</template>
