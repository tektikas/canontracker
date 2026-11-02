<script setup lang="ts">
// Disclosure menu: a button that opens a small panel of links and actions. Closes on outside click, Esc and navigation.
// fixed: the panel is positioned from the trigger in viewport coordinates, so a scrolling ancestor (a table wrapper) can't clip it.
const props = withDefaults(defineProps<{ label: string, placement?: 'down' | 'up', fixed?: boolean }>(), { placement: 'down' })
const open = ref(false)
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const pos = ref<Record<string, string>>({})
const close = () => { open.value = false }
function toggle() {
  if (!open.value && props.fixed && trigger.value) {
    const r = trigger.value.getBoundingClientRect()
    const up = innerHeight - r.bottom < Math.min(420, innerHeight * 0.7) && r.top > innerHeight - r.bottom
    pos.value = { right: `${Math.min(Math.max(innerWidth - r.right, 8), innerWidth - 236)}px`, left: 'auto', ...(up ? { bottom: `${innerHeight - r.top + 4}px`, top: 'auto' } : { top: `${r.bottom + 4}px` }), maxHeight: `${Math.max(160, (up ? r.top : innerHeight - r.bottom) - 12)}px` }
  }
  open.value = !open.value
}
const outside = (e: Event) => { if (!root.value?.contains(e.target as Node)) close() }
watch(open, (o) => {
  const f = o ? 'addEventListener' : 'removeEventListener'
  document[f]('pointerdown', outside)
  if (props.fixed) { window[f]('scroll', close, true); window[f]('resize', close) } // a fixed panel would drift from its trigger
})
onBeforeUnmount(() => { open.value = false })
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
    <button ref="trigger" type="button" class="menu-trigger" :aria-label="label" :aria-expanded="open" @click="toggle">
      <slot name="trigger" :open="open" />
    </button>
    <div v-if="open" class="menu-pop" :class="[placement, { fixed }]" :style="fixed ? pos : undefined">
      <slot :close="close" />
    </div>
  </div>
</template>

<style scoped>
.menu { position: relative; }
.menu-trigger { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 8px; border: 1px solid transparent; border-radius: var(--r-md); background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease); }
.menu-trigger:hover, .menu-trigger[aria-expanded=true] { background: var(--sunken); }
.menu-pop { position: absolute; left: 0; right: 0; z-index: 50; display: grid; gap: 1px; padding: var(--s-1); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--elev-overlay); max-height: min(420px, 70vh); overflow-y: auto; }
.menu-pop.fixed { position: fixed; left: auto; width: max-content; min-width: 220px; }
.menu-pop.down { top: calc(100% + 4px); }
.menu-pop.up { bottom: calc(100% + 4px); }
.menu-pop :deep(.menu-item) { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 34px; padding: 6px 10px; border: 0; border-radius: var(--r-md); background: none; color: var(--ink); font: inherit; font-size: var(--text-base); text-align: left; text-decoration: none; cursor: pointer; }
.menu-pop :deep(.menu-item:hover) { background: var(--sunken); color: var(--ink); }
.menu-pop :deep(.menu-item svg) { color: var(--faint); flex: none; }
.menu-pop :deep(.menu-label) { padding: 8px 10px 2px; font-size: var(--text-xs); font-weight: 600; color: var(--faint); }
.menu-pop :deep(.menu-sep) { height: 1px; margin: var(--s-1) 0; background: var(--line); border: 0; }
@media (max-width: 900px) { .menu-pop :deep(.menu-item) { min-height: 42px; } }
</style>
