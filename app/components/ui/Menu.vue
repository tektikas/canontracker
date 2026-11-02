<script setup lang="ts">
// Disclosure menu: a button that opens a small panel of links and actions. Closes on outside click, Esc and navigation.
// The panel is always positioned from the trigger in viewport coordinates, so no scrolling ancestor can clip it; it flips up when there is no room below.
defineProps<{ label: string }>()
const open = ref(false)
const root = ref<HTMLElement>()
const panel = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const pos = ref<Record<string, string>>({})
const close = () => { open.value = false }
function toggle() {
  if (!open.value && trigger.value) {
    const r = trigger.value.getBoundingClientRect()
    const up = innerHeight - r.bottom < Math.min(420, innerHeight * 0.7) && r.top > innerHeight - r.bottom
    pos.value = { right: `${Math.min(Math.max(innerWidth - r.right, 8), Math.max(8, innerWidth - 236))}px`, left: 'auto', ...(up ? { bottom: `${innerHeight - r.top + 4}px`, top: 'auto' } : { top: `${r.bottom + 4}px` }), maxHeight: `${Math.max(160, (up ? r.top : innerHeight - r.bottom) - 12)}px` }
  }
  open.value = !open.value
  if (open.value) nextTick(() => { // a wider panel (min-width set by a call site) must not run off the left edge
    const l = panel.value?.getBoundingClientRect().left
    if (l !== undefined && l < 8) pos.value = { ...pos.value, right: `${parseFloat(pos.value.right ?? "0") + l - 8}px` }
  })
}
const onScroll = (e: Event) => { if (!panel.value?.contains(e.target as Node)) close() } // scrolling inside the panel must not close it
const outside = (e: Event) => { if (!root.value?.contains(e.target as Node)) close() }
watch(open, (o) => {
  const f = o ? 'addEventListener' : 'removeEventListener'
  document[f]('pointerdown', outside)
  window[f]('scroll', onScroll, true); window[f]('resize', close) // the panel would drift from its trigger
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
    <div v-if="open" ref="panel" class="menu-pop" :style="pos">
      <slot :close="close" />
    </div>
  </div>
</template>

<style scoped>
.menu { position: relative; }
.menu-trigger { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 8px; border: 1px solid transparent; border-radius: var(--r-md); background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease); }
.menu-trigger:hover, .menu-trigger[aria-expanded=true] { background: var(--sunken); }
.menu-pop { position: fixed; left: auto; width: max-content; min-width: min(220px, calc(100vw - 16px)); max-width: calc(100vw - 16px); z-index: 50; display: grid; gap: 1px; padding: var(--s-1); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--elev-overlay); max-height: min(420px, 70vh); overflow-y: auto; }
.menu-pop :deep(.menu-item) { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 34px; padding: 6px 10px; border: 0; border-radius: var(--r-md); background: none; color: var(--ink); font: inherit; font-size: var(--text-base); text-align: left; text-decoration: none; cursor: pointer; overflow-wrap: anywhere; }
.menu-pop :deep(.menu-item:hover) { background: var(--sunken); color: var(--ink); }
.menu-pop :deep(.menu-item svg) { color: var(--faint); flex: none; }
.menu-pop :deep(.menu-label) { padding: 8px 10px 2px; font-size: var(--text-xs); font-weight: 600; color: var(--faint); }
.menu-pop :deep(.menu-sep) { height: 1px; margin: var(--s-1) 0; background: var(--line); border: 0; }
@media (max-width: 900px) { .menu-pop :deep(.menu-item) { min-height: 42px; } }
</style>
