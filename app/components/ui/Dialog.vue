<script setup lang="ts">
// Modal sheet on the native <dialog>: focus trap, Esc and inert page for free. Centered on wide screens, a bottom sheet on
// phones. v-model:open drives it; closing by Esc, the backdrop or the × sets it back to false.
const open = defineModel<boolean>('open', { default: false })
defineProps<{ title: string, wide?: boolean }>()
const dlg = ref<HTMLDialogElement>()
const id = useId()
const sync = () => {
  const d = dlg.value
  if (!d) return
  if (open.value && !d.open) d.showModal()
  else if (!open.value && d.open) d.close()
}
watch(open, sync, { flush: 'post' })
onMounted(sync)
// A click on the dialog element itself (not its content) is a click on the backdrop.
const backdrop = (e: MouseEvent) => { if (e.target === dlg.value) dlg.value?.close() }
</script>

<template>
  <dialog ref="dlg" class="ui-dialog" :class="{ wide }" :aria-labelledby="id" @close="open = false" @click="backdrop">
    <div class="ui-dialog-sheet">
      <header class="ui-dialog-head">
        <h2 :id="id">{{ title }}</h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="dlg?.close()"><UiIcon name="close" :size="18" /></button>
      </header>
      <div class="ui-dialog-body"><slot /></div>
      <footer v-if="$slots.actions" class="ui-dialog-actions"><slot name="actions" /></footer>
    </div>
  </dialog>
</template>

<style scoped>
.ui-dialog {
  width: min(480px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); padding: 0;
  border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--raised); color: var(--ink); box-shadow: var(--elev-overlay);
}
.ui-dialog.wide { width: min(720px, calc(100vw - 32px)); }
.ui-dialog::backdrop { background: rgb(8 12 18 / 0.45); }
.ui-dialog-sheet { display: flex; flex-direction: column; max-height: calc(100dvh - 48px); }
.ui-dialog-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding: var(--s-4) var(--s-5) 0; }
.ui-dialog-head h2 { margin: 0; font-size: var(--text-lg); }
.ui-dialog-head .icon-btn { color: var(--muted); margin-right: calc(-1 * var(--s-2)); }
.ui-dialog-body { display: grid; gap: var(--s-3); padding: var(--s-3) var(--s-5) var(--s-4); overflow-y: auto; min-height: 0; color: var(--muted); }
.ui-dialog-body :deep(p) { margin: 0; }
.ui-dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--s-2); padding: var(--s-3) var(--s-5) var(--s-4); border-top: 1px solid var(--line); }
@media (max-width: 720px) {
  .ui-dialog, .ui-dialog.wide { width: 100vw; max-width: 100vw; margin: auto 0 0; border-radius: var(--r-lg) var(--r-lg) 0 0; border-bottom: 0; }
  .ui-dialog-sheet { max-height: calc(100dvh - 24px); padding-bottom: env(safe-area-inset-bottom, 0px); }
  .ui-dialog-head { padding: var(--s-4) var(--s-4) 0; }
  .ui-dialog-body { padding: var(--s-3) var(--s-4) var(--s-4); }
  .ui-dialog-actions { padding: var(--s-3) var(--s-4) var(--s-4); flex-direction: column-reverse; }
  .ui-dialog-actions :deep(.btn) { width: 100%; justify-content: center; }
}
</style>
