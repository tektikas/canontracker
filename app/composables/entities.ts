import type { InternalApi } from 'nitropack/types'

export type EntityListItem = InternalApi['/api/entities']['get'][number]
export type EntityPage = InternalApi['/api/entities/:id']['get']

// The project's wiki pages, shared under one key: the shell loads it once, mentions and the index read the same list.
export const useEntityList = () => useFetch('/api/entities', { key: 'entities', default: () => [] as EntityListItem[] })
export const refreshEntities = () => refreshNuxtData('entities')

// Name/alias lookup and one matcher per list, built once and shared by every MentionText on the page.
interface Lookup { byName: Map<string, EntityListItem>, pattern: RegExp | null }
const lookups = new WeakMap<object, Lookup>()
const EMPTY: Lookup = { byName: new Map(), pattern: null }
export function useEntityLookup() {
  const { data } = useNuxtData<EntityListItem[]>('entities')
  return computed(() => {
    const list = data.value
    if (!list?.length) return EMPTY
    let l = lookups.get(list)
    if (!l) {
      const byName = new Map<string, EntityListItem>()
      for (const e of list) for (const n of [e.name, ...e.aliases]) byName.set(normName(n), e)
      l = { byName, pattern: mentionPattern(list.flatMap(e => [e.name, ...e.aliases])) }
      lookups.set(list, l)
    }
    return l
  })
}

// One hover card for the whole app. Mentions open it on hover, focus or tap; it stays while the pointer is over it.
interface CardState { id: string, top: number, bottom: number, left: number }
let showTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined
export function useMentionCard() {
  const state = useState<CardState | null>('mention-card', () => null)
  const open = (id: string, el: Element, delay = 0) => {
    clearTimeout(hideTimer)
    clearTimeout(showTimer)
    const r = el.getBoundingClientRect()
    showTimer = setTimeout(() => { state.value = { id, top: r.top, bottom: r.bottom, left: r.left } }, delay)
  }
  const leave = () => {
    clearTimeout(showTimer)
    hideTimer = setTimeout(() => { state.value = null }, 180)
  }
  const stay = () => clearTimeout(hideTimer)
  const close = () => {
    clearTimeout(showTimer)
    state.value = null
  }
  return { state, open, leave, stay, close }
}

export const kindLabel = (k: string) => KIND_LABEL[k as EntityKind] ?? KIND_LABEL.other
export const counted = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
