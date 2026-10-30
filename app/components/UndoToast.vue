<script setup lang="ts">
// A short-lived bar for actions that only detach something (portrait, cover): Undo puts it back.
defineProps<{ message: string }>()
const emit = defineEmits<{ undo: [], close: [] }>()
const t = setTimeout(() => emit('close'), 10_000)
onBeforeUnmount(() => clearTimeout(t))
</script>

<template>
  <div class="toast" role="status">
    <span>{{ message }}</span>
    <UiButton size="sm" @click="emit('undo')">Undo</UiButton>
    <button type="button" class="x" aria-label="Dismiss" @click="emit('close')"><UiIcon name="close" :size="16" /></button>
  </div>
</template>

<style scoped>
.toast { position: fixed; z-index: 50; left: 50%; bottom: var(--s-5); transform: translateX(-50%); display: flex; align-items: center; gap: var(--s-3); max-width: calc(100vw - 32px); padding: var(--s-2) var(--s-3) var(--s-2) var(--s-4); border: 1px solid var(--line-strong); border-radius: var(--r-md); background: var(--raised); color: var(--ink); box-shadow: var(--elev-overlay); font-size: var(--text-sm); }
.x { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: var(--r-sm, 6px); background: none; color: var(--muted); cursor: pointer; }
.x:hover { background: var(--sunken); color: var(--ink); }
</style>
