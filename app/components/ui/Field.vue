<script setup lang="ts">
// Label + control + hint/error. Put the input in the default slot.
defineProps<{ label: string, hint?: string, error?: string }>()
</script>

<template>
  <label>
    {{ label }}
    <slot />
    <span v-if="error" class="field-error" role="alert">{{ error }}</span>
    <span v-else-if="hint" class="field-hint">{{ hint }}</span>
  </label>
</template>
