// Ctrl+Enter (⌘+Enter on Mac) sends the form the focused field belongs to, the same as clicking its submit button.
// One listener for the whole app. A form whose submit button is missing or disabled does nothing, and the command palette is left alone.
export default defineNuxtPlugin(() => {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return
    const target = e.target
    if (!(target instanceof HTMLElement) || target.closest('.palette')) return
    // .form honours form="" (a button owned by another form); closest() covers anything else inside a form.
    const form = ('form' in target ? (target as HTMLButtonElement).form : null) ?? target.closest('form')
    // form.elements includes controls that point at this form with form="" (a dialog footer's submit button).
    const send = form && Array.from(form.elements).find((el): el is HTMLButtonElement | HTMLInputElement => (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) && el.getAttribute('type') === 'submit' && !el.disabled)
    if (!form || !send) return
    e.preventDefault()
    form.requestSubmit(send)
  })
})
