<script setup lang="ts">
// The site-wide chat: a right-side drawer over any page (⌘/Ctrl+J or the floating button). It opens on the latest
// conversation (or a new one) and attaches what the current page is about as removable chips. Not modal: the page stays
// usable beside it on wide screens; on phones it covers the screen.
const chat = useChat()
const { data: list, refresh } = useFetch('/api/conversations', { default: () => [], immediate: false, server: false })
const thread = ref<{ conversation: { title: string } | null }>()
const title = computed(() => (chat.value.conv && thread.value?.conversation?.title) || 'New conversation')
const panel = ref<HTMLElement>()
watch(() => chat.value.open, async (open) => {
  if (!open) return
  await refresh()
  if (!chat.value.picked) Object.assign(chat.value, { conv: list.value[0]?.id ?? null, picked: true })
  await nextTick()
  panel.value?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
}, { immediate: true })
const close = () => { chat.value.open = false }
function pick(id: string | null) {
  Object.assign(chat.value, { conv: id, picked: true })
  if (!id) chat.value.tick++
}
</script>

<template>
  <Transition name="drawer">
    <aside v-if="chat.open" ref="panel" class="chat-drawer" aria-label="Chat" @keydown.esc="close">
      <header class="drawer-head">
        <UiMenu label="Conversations" class="conv-menu">
          <template #trigger>
            <UiIcon name="ask" :size="16" />
            <span class="conv-title">{{ title }}</span>
            <UiIcon name="chevrons" :size="14" class="faint" />
          </template>
          <template #default="{ close: done }">
            <button type="button" class="menu-item" @click="pick(null); done()"><UiIcon name="plus" :size="16" />New conversation</button>
            <template v-if="list.length">
              <hr class="menu-sep">
              <div class="menu-label">Recent</div>
              <button v-for="c in list.slice(0, 8)" :key="c.id" type="button" class="menu-item" :aria-current="c.id === chat.conv || undefined" @click="pick(c.id); done()">
                <UiIcon :name="c.mode === 'research' ? 'research' : 'canon'" :size="16" /><span class="menu-grow">{{ c.title }}</span>
              </button>
            </template>
            <hr class="menu-sep">
            <NuxtLink to="/ask" class="menu-item" @click="close"><UiIcon name="arrow" :size="16" />All conversations</NuxtLink>
          </template>
        </UiMenu>
        <NuxtLink v-if="chat.conv" :to="`/ask?c=${chat.conv}`" class="icon-btn" title="Open in Ask" aria-label="Open in Ask" @click="close"><UiIcon name="focus" :size="18" /></NuxtLink>
        <button type="button" class="icon-btn" aria-label="Close chat" title="Close (Esc)" @click="close"><UiIcon name="close" :size="18" /></button>
      </header>
      <ChatThread ref="thread" v-model:conv="chat.conv" contained class="drawer-thread" @changed="refresh">
        <template #empty>
          <div class="starter">
            <p><b>Ask your team’s story.</b></p>
            <p class="small muted">Canon answers only from accepted canon, with sources. Research looks at the real world and never becomes canon. Everyone on the project sees this conversation.</p>
          </div>
        </template>
      </ChatThread>
    </aside>
  </Transition>
</template>

<style scoped>
.chat-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 45; width: min(440px, 100vw);
  display: flex; flex-direction: column; background: var(--surface); border-left: 1px solid var(--line); box-shadow: var(--elev-overlay);
}
.drawer-head { display: flex; align-items: center; gap: var(--s-1); padding: var(--s-2) var(--s-2) var(--s-2) var(--s-3); border-bottom: 1px solid var(--line); }
.conv-menu { flex: 1; min-width: 0; }
.conv-menu :deep(.menu-trigger) { gap: 8px; font-weight: 600; }
.conv-menu :deep(.menu-pop) { min-width: 300px; }
.conv-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-item[aria-current] { font-weight: 600; }
.drawer-thread { flex: 1; }
.starter { display: grid; gap: var(--s-2); padding: var(--s-4) 0; }
.starter p { margin: 0; }
.drawer-enter-active, .drawer-leave-active { transition: transform var(--dur-2) var(--ease), opacity var(--dur-2) var(--ease); }
.drawer-enter-from, .drawer-leave-to { transform: translateX(24px); opacity: 0; }
@media (prefers-reduced-motion: reduce) { .drawer-enter-active, .drawer-leave-active { transition: none; } }
@media (max-width: 720px) {
  .chat-drawer { width: 100vw; border-left: 0; padding-bottom: env(safe-area-inset-bottom, 0px); }
}
</style>
