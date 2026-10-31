// Share links are for people outside the studio. Set first, so errors carry them too: never cached (a revoked link must stop
// working), never indexed, never sent on as a referrer. Share pages also drop the visitor's cookie, so a signed-in studio member's
// session is not hydrated into the page payload: the page holds the bible and nothing else.
export default defineEventHandler((event) => {
  const path = event.path.split('?')[0]!
  const isPage = path.startsWith('/share/')
  if (!isPage && !path.startsWith('/api/public/share/')) return
  setHeaders(event, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' })
  if (isPage) delete event.node.req.headers.cookie
})
