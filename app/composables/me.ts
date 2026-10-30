import type { InternalApi } from 'nitropack/types'

export type Me = InternalApi['/api/me']['get']
export type Role = 'owner' | 'admin' | 'editor' | 'viewer'

// The signed-in person, their studios and projects, and the project they are in. Loaded by the auth middleware.
export const useMe = () => useState<Me | null>('me', () => null)

export async function loadMe() {
  const me = useMe()
  me.value = await useRequestFetch()('/api/me')
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

export async function logOut() {
  await $fetch('/api/_auth/session', { method: 'DELETE' })
  reloadNuxtApp({ path: '/', force: true })
}

// Only same-site paths; anything else goes home.
export const safeRedirect = (v: unknown) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : '/')
