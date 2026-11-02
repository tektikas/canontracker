<script setup lang="ts">
// The floating card for EntityMention. Fixed position next to the mention, kept inside the viewport.
const card = useMentionCard()
const { data: list } = useNuxtData<EntityListItem[]>('entities')
const kindLabel = useKind()
const entity = computed(() => card.state.value && list.value?.find(e => e.id === card.state.value!.id))
const el = ref<HTMLElement>()
const pos = ref({ top: 0, left: 0 })

watch(() => card.state.value, async (s) => {
  if (!s) return
  await nextTick()
  const box = el.value
  if (!box) return
  const w = box.offsetWidth
  const h = box.offsetHeight
  const below = s.bottom + 8 + h <= innerHeight - 8
  pos.value = { top: below ? s.bottom + 8 : Math.max(8, s.top - 8 - h), left: Math.max(8, Math.min(s.left, innerWidth - w - 8)) }
}, { flush: 'post' })

// Close when the page moves under it, on navigation, or on a tap elsewhere.
const route = useRoute()
watch(() => route.fullPath, card.close)
// Focusing a mention can scroll it into view: keep its card and follow it instead of closing.
function scrolled() {
  const a = document.activeElement as HTMLElement | null
  if (a?.dataset.entity && a.classList.contains('mention')) card.open(a.dataset.entity, a)
  else card.close()
}
function outside(e: PointerEvent) {
  const t = e.target as Element
  if (!el.value?.contains(t) && !t.closest?.('.mention')) card.close()
}
onMounted(() => {
  addEventListener('scroll', scrolled, { capture: true, passive: true })
  addEventListener('resize', card.close)
  document.addEventListener('pointerdown', outside)
})
onBeforeUnmount(() => {
  removeEventListener('scroll', scrolled, { capture: true })
  removeEventListener('resize', card.close)
  document.removeEventListener('pointerdown', outside)
})
</script>

<template>
  <div
    v-if="entity" id="mention-card" ref="el" class="mcard" :aria-label="`${entity.name}, preview`" role="group" :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
    @mouseenter="card.stay()" @mouseleave="card.leave()" @keydown.esc="card.close()"
  >
    <div class="mhead">
      <EntityAvatar :entity="entity" :size="44" />
      <div class="mtitle">
        <strong>{{ entity.name }}</strong>
        <span class="small muted">{{ kindLabel(entity.kind).one }} · {{ counted(entity.facts, 'canon fact') }}</span>
      </div>
    </div>
    <p v-if="entity.summary" class="msum">{{ entity.summary }}</p>
    <p v-else-if="entity.first_fact" class="msum story">{{ entity.first_fact }}</p>
    <p v-if="entity.aliases.length" class="small muted malias">Also: {{ entity.aliases.join(', ') }}</p>
    <NuxtLink :to="`/entities/${entity.id}`" class="mlink small" @click="card.close()">Open page <UiIcon name="arrow" :size="14" /></NuxtLink>
  </div>
</template>

<style scoped>
.mcard { position: fixed; z-index: 80; width: min(300px, calc(100vw - 16px)); display: grid; gap: var(--s-2); padding: var(--s-3); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--elev-overlay); font-family: var(--font-ui); font-size: var(--text-base); line-height: 1.45; color: var(--ink); text-align: left; }
.mhead { display: flex; gap: var(--s-3); align-items: center; }
.mtitle { display: grid; min-width: 0; }
.mtitle strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msum { margin: 0; font-size: var(--text-sm); display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.msum.story { font-family: var(--font-story); }
.malias { margin: 0; }
.mlink { display: inline-flex; align-items: center; gap: 4px; justify-self: start; font-weight: 600; min-height: 28px; }
</style>
