// The guided demo tour (GuidedTour.vue in the default layout). `step` is null when no tour is running. It survives a reload
// through sessionStorage, so a full page load mid-tour picks up where it was.
const KEY = 'sb-tour-step'

export function useTour() {
  const step = useState<number | null>('tour-step', () => null)
  const set = (n: number | null) => {
    step.value = n
    try {
      if (n == null) sessionStorage.removeItem(KEY)
      else sessionStorage.setItem(KEY, String(n))
    } catch {}
  }
  const resume = () => {
    try {
      const v = sessionStorage.getItem(KEY)
      if (v != null && step.value == null) step.value = Number(v)
    } catch {}
  }
  return { step, set, resume, start: () => set(0), stop: () => set(null) }
}
