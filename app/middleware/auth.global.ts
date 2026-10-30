// Signed out: only the landing page, log-in, sign-up and invite links. Signed in without a project: onboarding first.
export default defineNuxtRouteMiddleware(async (to) => {
  const me = useMe()
  if (import.meta.server || !me.value) await loadMe()
  const open = to.path === '/' || to.path === '/login' || to.path === '/signup' || to.path.startsWith('/invite/')
  if (!me.value?.user) return open ? undefined : navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  if (to.path === '/login' || to.path === '/signup') return navigateTo(safeRedirect(to.query.redirect))
  if (!me.value.current && to.path !== '/onboarding' && !to.path.startsWith('/invite/')) return navigateTo('/onboarding')
})
