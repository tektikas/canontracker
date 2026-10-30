<script setup lang="ts">
import type { IconName } from './Icon.vue'

// Thin wrapper over the global .btn classes, so pages using <button class="btn primary"> and <UiButton variant="primary"> look the same.
withDefaults(defineProps<{
  variant?: 'secondary' | 'primary' | 'ghost' | 'danger' | 'good'
  size?: 'sm' | 'md' | 'lg'
  to?: string
  icon?: IconName
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}>(), { variant: 'secondary', size: 'md', type: 'button' })
</script>

<template>
  <NuxtLink v-if="to" :to="to" class="btn" :class="[variant, size]">
    <UiIcon v-if="icon" :name="icon" :size="16" /><slot />
  </NuxtLink>
  <button v-else :type="type" class="btn" :class="[variant, size]" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <UiIcon v-else-if="icon" :name="icon" :size="16" />
    <slot />
  </button>
</template>
