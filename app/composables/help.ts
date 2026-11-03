// The ? key: opens the current page's help (app/help/routes.ts) in a new tab, the same as the ? button. One handler for
// every layout that shows the button. Never while typing, inside a dialog, or while any modal (a <dialog>, Write's
// focus mode) is open.
import { helpSlugFor } from '~/help/routes'

export function useHelpKey() {
  const route = useRoute()
  function onKey(e: KeyboardEvent) {
    const slug = helpSlugFor(route.name)
    if (!slug || e.repeat || e.isComposing || !pressed(e, 'app.help')) return
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable], dialog, [role=dialog], [aria-modal=true]')) return
    if (document.querySelector('dialog[open], [aria-modal=true]')) return
    e.preventDefault()
    window.open(`/help/${slug}`, '_blank', 'noopener')
  }
  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
