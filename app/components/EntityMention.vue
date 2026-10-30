<script setup lang="ts">
// A linked name. Mouse: hover shows the card, click opens the page. Keyboard: focus shows the card, Enter opens the page.
// Touch: the first tap shows the card (it has the link), a second tap on the name opens the page. The click handler runs
// in the capture phase so it can cancel before NuxtLink navigates.
// A drag that starts on a name selects text (to add a fact or note). Chrome never starts a selection on a live link (an <a>
// with href), so a plain mouse press lifts the href until the button is released; a click still opens the page because the
// router navigates on click, and a click that ends a selection stays put. Modified clicks (new tab) keep the href.
const props = defineProps<{ entity: EntityListItem }>()
const card = useMentionCard()
let touch = false
const isOpen = computed(() => card.state.value?.id === props.entity.id)
function press(e: PointerEvent) {
  touch = e.pointerType !== 'mouse'
  if (touch || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
  const a = e.currentTarget as HTMLAnchorElement
  const href = a.getAttribute('href')
  if (!href) return
  a.removeAttribute('href')
  addEventListener('pointerup', () => a.setAttribute('href', href), { once: true, capture: true })
}
function click(e: MouseEvent) {
  if (!getSelection()?.isCollapsed) {
    e.preventDefault()
  } else if (touch && !isOpen.value) {
    e.preventDefault()
    card.open(props.entity.id, e.currentTarget as Element)
  }
  touch = false
}
</script>

<template><NuxtLink
  :to="`/entities/${entity.id}`" class="mention" draggable="false" :data-entity="entity.id" :aria-describedby="isOpen ? 'mention-card' : undefined"
  @pointerdown="press"
  @mouseenter="card.open(entity.id, $event.currentTarget as Element, 300)" @mouseleave="card.leave()"
  @focus="card.open(entity.id, $event.currentTarget as Element)" @blur="card.leave()" @keydown.esc="card.close()" @click.capture="click"
><slot /></NuxtLink></template>

<style scoped>
.mention { color: inherit; text-decoration: underline; text-decoration-style: dotted; text-decoration-color: color-mix(in srgb, var(--accent) 60%, transparent); text-decoration-thickness: 1.5px; text-underline-offset: 3px; border-radius: 2px; }
.mention:hover { color: var(--accent); text-decoration-style: solid; }
.mention:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
</style>
