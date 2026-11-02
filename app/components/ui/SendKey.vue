<script setup lang="ts">
// The send shortcut, shown on a dialog's primary button: ⌘↵ on Apple devices, Ctrl↵ elsewhere. Hidden on phones (no keyboard).
const mac = ref(false)
onMounted(() => { mac.value = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) })
</script>

<template>
  <kbd class="send-key" aria-hidden="true">{{ mac ? '⌘↵' : 'Ctrl↵' }}</kbd>
</template>

<style scoped>
.send-key { margin-left: var(--s-2); padding: 0 5px; border: 1px solid currentColor; border-radius: var(--r-sm); font: inherit; font-size: var(--text-xs); opacity: 0.75; }
@media (max-width: 720px) { .send-key { display: none; } }
</style>
