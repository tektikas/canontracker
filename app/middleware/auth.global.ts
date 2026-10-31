// Signed out: only the landing page, log-in, sign-up, invite and share links. Signed in without a project: onboarding first.
export default defineNuxtRouteMiddleware(async (to) => {
  // Share links are public and never depend on who (if anyone) is signed in.
  if (to.path.startsWith('/share/')) return
  const me = useMe()
  if (import.meta.server || !me.value) await loadMe()
  const open = to.path === '/' || to.path === '/login' || to.path === '/signup' || to.path.startsWith('/invite/')
  if (!me.value?.user) return open ? undefined : navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  if (to.path === '/login' || to.path === '/signup') return navigateTo(safeRedirect(to.query.redirect))
  if (!me.value.current && to.path !== '/onboarding' && !to.path.startsWith('/invite/')) return navigateTo('/onboarding')
})
