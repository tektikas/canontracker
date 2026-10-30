import { appendResponseHeader } from 'h3'
import type { InternalApi } from 'nitropack/types'

export type Me = InternalApi['/api/me']['get']
export type Role = 'owner' | 'admin' | 'editor' | 'viewer'

// The signed-in person, their studios and projects, and the project they are in. Loaded by the auth middleware.
export const useMe = () => useState<Me | null>('me', () => null)

export async function loadMe() {
  const me = useMe()
  // Read the request context before awaiting: it is gone afterwards.
  const event = import.meta.server ? useRequestEvent()! : undefined
  const res = await $fetch.raw('/api/me', { headers: useRequestHeaders(['cookie']) })
  if (event) {
    // /api/me may re-point the session at a fallback project. Pass its cookie on to the browser, and use it for
    // the rest of this render so content requests don't still carry the stale project.
    const set = res.headers.getSetCookie()
    for (const c of set) appendResponseHeader(event, 'set-cookie', c)
    if (set.length) {
      const fresh = set.map(c => c.split(';')[0]!)
      const names = new Set(fresh.map(c => c.split('=')[0]))
      const old = (event.node.req.headers.cookie ?? '').split('; ').filter(c => c && !names.has(c.split('=')[0]))
      event.node.req.headers.cookie = [...old, ...fresh].join('; ')
    }
  }
  me.value = res._data as Me
  return me.value
}

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' }
export const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including managing owners and the studio.',
  admin: 'Manages the team and projects, and can load demo data.',
  editor: 'Imports sources, reviews candidates, decides conflicts and changes.',
  viewer: 'Reads canon and asks questions. Can’t change anything.',
}
export const canEdit = (me: Me | null) => !!me?.current && me.current.role !== 'viewer'
export const canManage = (me: Me | null) => me?.current?.role === 'owner' || me?.current?.role === 'admin'

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')

// A full reload into the new project: every page, count and cached list belongs to the old one.
export async function openProject(id: string, path = '/') {
  await $fetch(`/api/projects/${id}/switch`, { method: 'POST' })
  reloadNuxtApp({ path, force: true })
}

// Leaving a studio reloads the app; the name rides along in sessionStorage so the landing page can say what
// happened. It expires instead of being removed on read, so a page that mounts and redirects first can't eat it.
const LEFT_KEY = 'sb-left-studio'
export const rememberLeft = (studio: string) => sessionStorage.setItem(LEFT_KEY, JSON.stringify({ studio, expires: Date.now() + 15_000 }))
export function useLeftNotice() {
  const left = ref('')
  onMounted(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(LEFT_KEY) ?? 'null')
      if (v && v.expires > Date.now()) left.value = v.studio
      else sessionStorage.removeItem(LEFT_KEY)
    } catch { sessionStorage.removeItem(LEFT_KEY) }
  })
  return left
}

export async function logOut() {
  await $fetch('/api/_auth/session', { method: 'DELETE' })
  reloadNuxtApp({ path: '/', force: true })
}

// Only same-site paths; anything else goes home.
export const safeRedirect = (v: unknown) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : '/')
