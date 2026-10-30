// The guided demo tour (GuidedTour.vue in the default layout). `step` is null when no tour is running. It survives a reload
// through sessionStorage, keyed per person and project: switching projects (a full reload) never resumes a tour that was
// started in another project.
export function useTour() {
  const me = useMe()
  const key = () => `sb-tour-step:${me.value?.user?.id}:${me.value?.current?.project.id}`
  const step = useState<number | null>('tour-step', () => null)
  const set = (n: number | null) => {
    step.value = n
    try {
      if (n == null) sessionStorage.removeItem(key())
      else sessionStorage.setItem(key(), String(n))
    } catch {}
  }
  const saved = () => {
    try {
      const v = sessionStorage.getItem(key())
      return v == null ? null : Number(v)
    } catch {
      return null
    }
  }
  const resume = () => {
    const v = saved()
    if (v != null && step.value == null) step.value = v
  }
  return { step, set, saved, resume, start: () => set(0), stop: () => set(null) }
}
