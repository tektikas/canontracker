<script setup lang="ts">
// Disclosure menu: a button that opens a small panel of links and actions. Closes on outside click, Esc and navigation.
withDefaults(defineProps<{ label: string, placement?: 'down' | 'up' }>(), { placement: 'down' })
const open = ref(false)
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const close = () => { open.value = false }
const outside = (e: PointerEvent) => { if (!root.value?.contains(e.target as Node)) close() }
watch(open, o => (o ? document.addEventListener('pointerdown', outside) : document.removeEventListener('pointerdown', outside)))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))
watch(() => useRoute().fullPath, close)
function esc(e: KeyboardEvent) {
  if (!open.value) return
  e.stopPropagation()
  close()
  trigger.value?.focus()
}
</script>

<template>
  <div ref="root" class="menu" @keydown.esc="esc">
    <button ref="trigger" type="button" class="menu-trigger" :aria-label="label" :aria-expanded="open" @click="open = !open">
      <slot name="trigger" :open="open" />
    </button>
    <div v-if="open" class="menu-pop" :class="placement">
      <slot :close="close" />
    </div>
  </div>
</template>

<style scoped>
.menu { position: relative; }
.menu-trigger { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 8px; border: 1px solid transparent; border-radius: var(--r-md); background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease); }
.menu-trigger:hover, .menu-trigger[aria-expanded=true] { background: var(--sunken); }
.menu-pop { position: absolute; left: 0; right: 0; z-index: 50; display: grid; gap: 1px; padding: var(--s-1); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--elev-overlay); max-height: min(420px, 70vh); overflow-y: auto; }
.menu-pop.down { top: calc(100% + 4px); }
.menu-pop.up { bottom: calc(100% + 4px); }
.menu-pop :deep(.menu-item) { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 34px; padding: 6px 10px; border: 0; border-radius: var(--r-md); background: none; color: var(--ink); font: inherit; font-size: var(--text-base); text-align: left; text-decoration: none; cursor: pointer; }
.menu-pop :deep(.menu-item:hover) { background: var(--sunken); color: var(--ink); }
.menu-pop :deep(.menu-item svg) { color: var(--faint); flex: none; }
.menu-pop :deep(.menu-label) { padding: 8px 10px 2px; font-size: var(--text-xs); font-weight: 600; color: var(--faint); }
.menu-pop :deep(.menu-sep) { height: 1px; margin: var(--s-1) 0; background: var(--line); border: 0; }
@media (max-width: 900px) { .menu-pop :deep(.menu-item) { min-height: 42px; } }
</style>
