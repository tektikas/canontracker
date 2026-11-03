// Long lists show a first slice and grow by a step on request, so no page turns into an endless scroll.
export function useShowMore<T>(list: MaybeRefOrGetter<T[] | null | undefined>, step: number, first = step) {
  const limit = ref(first)
  const all = computed(() => toValue(list) ?? [])
  const visible = computed(() => all.value.slice(0, limit.value))
  const rest = computed(() => Math.max(0, all.value.length - limit.value))
  const more = () => { limit.value += step }
  return { visible, rest, more, limit, step }
}
