import type { InternalApi } from 'nitropack/types'
import type { IconName } from '~/components/ui/Icon.vue'

type Stats = InternalApi['/api/stats']['get']

// The one action an empty page offers: the earliest missing step, from the stored counts the shell already loaded.
// No sources → add some; candidates waiting → review them; otherwise → add facts by hand from a source.
// Viewers can't do any of that, so they get Home, which says who adds things.
export function useFillAction() {
  const me = useMe()
  const { data: stats } = useNuxtData<Stats>('stats')
  return computed((): { label: string, to: string, icon: IconName } => {
    const s = stats.value
    if (!canEdit(me.value)) return { label: 'Go to Home', to: '/', icon: 'home' }
    if (!s?.documents) return { label: 'Add sources', to: '/', icon: 'upload' }
    if (s.pending) return { label: 'Review candidates', to: '/review', icon: 'review' }
    return { label: 'Add facts from a source', to: '/#sources', icon: 'file' }
  })
}
