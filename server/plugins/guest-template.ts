// Builds the guest demo's template (server/utils/guest.ts) right after start-up, so the first "Try the demo" after a deploy
// doesn't wait for it. A failure is logged and the next guest tries again.
export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  setTimeout(() => guestTemplate().catch(e => console.error('[guest] demo template failed:', e)), 500).unref()
})
