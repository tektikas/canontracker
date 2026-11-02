<script setup lang="ts">
import type { ChatChip, ChatMode } from '~/composables/chat'

// One conversation: its messages and the composer with the Canon / Research switch. Used by /ask, the drawer and the
// writer/reader panels. A null conversation is a new one, created by the first message. Teammates' messages arrive by polling
// (every 4 s while the tab is visible; the server answers "unchanged" when nothing was posted).
// contained: the thread is its own scroll box (drawer, panels); otherwise the page scrolls and the composer sticks to the bottom.
const props = defineProps<{ contained?: boolean }>()
const conv = defineModel<string | null>('conv', { default: null })
const emit = defineEmits<{ changed: [] }>()
const chat = useChat()
const page = useChatPage()
const me = useMe()
const meId = computed(() => me.value?.user?.id)

interface Message {
  id: string, role: 'user' | 'assistant', mode: ChatMode, text: string, created_at: string, reply_to: string | null, pending: boolean
  author: { id: string, name: string }, context: ChatChip[], parts: Record<string, any>[]
}
interface Thread { conversation: { id: string, title: string, mode: ChatMode, updated_at: string, created_by_name: string, created_at: string }, messages: Message[] }
const data = ref<Thread | null>(null)
const error = ref('')
const loadError = ref('')
async function load(id: string) {
  try {
    const r = await $fetch<Thread | { unchanged: true }>(`/api/conversations/${id}`, { query: data.value?.conversation.id === id ? { since: data.value.conversation.updated_at } : {} })
    if (conv.value !== id || 'unchanged' in r) return false
    if (data.value?.conversation.id !== id) chat.value.mode = r.conversation.mode
    data.value = r
    loadError.value = ''
    return true
  } catch (e) {
    if (conv.value === id) loadError.value = errorMessage(e)
    return false
  }
}
watch(conv, (id) => {
  error.value = ''
  if (!id) data.value = null
  else if (data.value?.conversation.id !== id) {
    data.value = null
    load(id).then(ok => ok && scrollEnd())
  }
})
let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  if (conv.value) load(conv.value).then(ok => ok && scrollEnd())
  poll = setInterval(async () => {
    if (!conv.value || sending.value || document.visibilityState !== 'visible') return
    const near = atEnd()
    if (await load(conv.value)) {
      emit('changed')
      if (near) scrollEnd()
    }
  }, 4000)
})
onBeforeUnmount(() => clearInterval(poll))


// Composer. Chips: a quoted selection (Research this) and what the current page is about; each can be removed.
const text = ref('')
const sending = ref(false)
const outgoing = ref<{ text: string, mode: ChatMode, context: ChatChip[] } | null>(null)
const removed = ref<string[]>([])
const key = (c: ChatChip) => `${c.type}:${c.id}`
watch(page, () => { removed.value = [] })
const chips = computed(() => [...(chat.value.quote ? [chat.value.quote] : []), ...page.value.filter(c => !removed.value.includes(key(c)) && !(chat.value.quote && key(chat.value.quote) === key(c)))])
function removeChip(c: ChatChip) {
  if (c === chat.value.quote) chat.value.quote = null
  else removed.value.push(key(c))
}
const box = ref<HTMLTextAreaElement>()
watch(() => chat.value.tick, () => {
  if (chat.value.prefill) {
    text.value = chat.value.prefill
    chat.value.prefill = ''
  }
  nextTick(() => box.value?.focus())
})
onMounted(() => {
  if (chat.value.prefill) {
    text.value = chat.value.prefill
    chat.value.prefill = ''
  }
})

async function send(t = text.value) {
  t = t.trim()
  if (!t || sending.value) return
  const mode = chat.value.mode
  const context = chips.value
  const body = { text: t, mode, context: context.map(({ type, id, quote }) => ({ type, id, quote })) }
  sending.value = true
  error.value = ''
  text.value = ''
  outgoing.value = { text: t, mode, context }
  scrollEnd()
  try {
    if (!conv.value) {
      const r = await $fetch<Thread>('/api/conversations', { method: 'POST', body })
      data.value = r
      conv.value = r.conversation.id
    } else {
      await $fetch(`/api/conversations/${conv.value}/messages`, { method: 'POST', body })
      await load(conv.value)
    }
    chat.value.quote = null
    emit('changed')
    refreshNuxtData('stats')
  } catch (e) {
    error.value = errorMessage(e)
    text.value = t
  } finally {
    sending.value = false
    outgoing.value = null
    scrollEnd()
  }
}
defineExpose({ conversation: computed(() => data.value?.conversation ?? null), reload: () => conv.value && load(conv.value), send })
// Enter sends; Shift+Enter (and IME composition) keep the newline.
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return
  e.preventDefault()
  send()
}

const scroller = ref<HTMLElement>()
function atEnd() {
  if (props.contained) return !scroller.value || scroller.value.scrollHeight - scroller.value.scrollTop - scroller.value.clientHeight < 80
  return innerHeight + scrollY > document.documentElement.scrollHeight - 120
}
function scrollEnd() {
  nextTick(() => {
    if (props.contained) scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
    else window.scrollTo({ top: document.documentElement.scrollHeight })
  })
}

const messages = computed(() => data.value?.messages ?? [])
const continued = computed(() => new Set(messages.value.map(m => m.reply_to)))
// Only the latest answer shows its sources open on the page; earlier ones fold so the conversation stays readable.
const lastAnswer = computed(() => messages.value.findLast(m => m.role === 'assistant')?.id)
// A teammate's question still being answered (or one whose answer never came: the server stopped mid-answer).
const waiting = (m: Message) => Date.now() - new Date(m.created_at).getTime() < 120_000

const STATUS = {
  supported: { tone: 'good', label: 'Supported by canon', text: 'Answered from accepted canon. Check the sources below.' },
  source_only: { tone: 'warn', label: 'Related canon only', text: 'The model is offline, so no answer was written. These accepted facts look related; read them yourself.' },
  unknown: { tone: 'neutral', label: 'Unknown', text: 'No accepted canon fact answers this. Nothing was guessed.' },
} as const
const statusOf = (p: Record<string, any>) => STATUS[p.status as keyof typeof STATUS]
const MODES = [
  { value: 'canon' as const, label: 'Canon', icon: 'canon' as const, hint: 'Answers only from accepted canon, with sources. Fast.' },
  { value: 'research' as const, label: 'Research', icon: 'research' as const, hint: 'Outside sources, for real-world questions. Slower; never added to canon.' },
]
const modeHint = computed(() => MODES.find(m => m.value === chat.value.mode)!.hint)
const chipIcon = (c: ChatChip) => (c.type === 'entity' ? 'entities' : c.type === 'conflict' ? 'conflicts' : c.quote ? 'quote' : 'file')
</script>

<template>
  <div class="chat-thread" :class="{ contained }">
    <div ref="scroller" class="thread" role="log" aria-live="polite" aria-label="Conversation">
      <p v-if="loadError" class="notice bad" role="alert">{{ loadError }}</p>
      <slot v-else-if="!messages.length && !outgoing && !(conv && !data)" name="empty" />
      <p v-if="conv && !data && !loadError" class="faint small" role="status">Opening the conversation…</p>

      <template v-for="m in messages" :key="m.id">
        <div v-if="m.role === 'user'" class="msg user" :class="{ mine: m.author.id === meId }">
          <div class="who small">
            <span class="avatar" aria-hidden="true">{{ initials(m.author.name) }}</span>
            <b>{{ m.author.id === meId ? 'You' : m.author.name }}</b>
            <span class="faint" :title="dateTime(m.created_at)">{{ timeAgo(m.created_at) }}</span>
            <span v-if="m.mode === 'research'" class="mode-tag research"><UiIcon name="research" :size="12" />Research</span>
          </div>
          <p class="bubble">{{ m.text }}</p>
          <ul v-if="m.context.length" class="chips sent" aria-label="Attached">
            <li v-for="c in m.context" :key="`${c.type}:${c.id}`" class="ctx-chip" :title="c.quote">
              <UiIcon :name="chipIcon(c)" :size="12" /><span>{{ c.quote ? `“${c.quote.length > 60 ? `${c.quote.slice(0, 60)}…` : c.quote}”` : c.label }}</span>
            </li>
          </ul>
          <p v-if="m.pending" class="small faint" role="status">{{ waiting(m) ? (m.mode === 'research' ? 'Researching…' : 'Searching the canon…') : 'No answer was recorded for this message.' }}</p>
        </div>

        <div v-else class="msg answer">
          <template v-for="(p, i) in m.parts" :key="i">
            <div v-if="p.type === 'canon'" class="from canon verdict" :class="statusOf(p).tone" :data-status="p.status">
              <div class="from-head">
                <span class="from-label"><UiIcon name="canon" :size="14" />From your canon</span>
                <UiBadge :tone="statusOf(p).tone" dot>{{ statusOf(p).label }}</UiBadge>
              </div>
              <p v-if="p.asked_as" class="small muted asked">Asked as “{{ p.asked_as }}”</p>
              <p v-if="p.answer" class="answer-text">{{ p.answer }}</p>
              <p v-if="p.model_error" class="notice bad" role="alert">{{ p.model_error }} The related facts below were found by keyword match, not by the model.</p>
              <p v-else-if="!p.answer" class="verdict-text">{{ statusOf(p).text }}</p>
              <details v-if="p.cited.length" class="cited" :open="!contained && m.id === lastAnswer">
                <summary class="small">{{ p.status === 'supported' ? 'Sources' : 'Related accepted facts' }} <span class="faint">{{ p.cited.length }}</span></summary>
                <div v-for="f in p.cited" :key="f.id" class="cited-fact">
                  <UiBadge v-if="f.status !== 'canon'" tone="warn" title="This fact was canon when the answer was written.">No longer canon ({{ f.status }})</UiBadge>
                  <FactSummary :fact="f" sources />
                </div>
              </details>
              <span class="small faint model">AI ·<span class="mono">{{ p.trace_id }}</span></span>
            </div>

            <div v-else-if="p.type === 'research'" class="from research">
              <div class="from-head"><span class="from-label"><UiIcon name="research" :size="14" />From research — outside sources, not canon</span></div>
              <p class="answer-text">{{ p.text }}</p>
            </div>

            <div v-else-if="p.type === 'followup'" class="from followup" :class="m.mode">
              <div class="from-head"><span class="from-label"><UiIcon name="ask" :size="14" />{{ m.mode === 'research' ? 'Research' : 'Canon' }} needs one detail</span></div>
              <p class="answer-text">{{ p.question }}</p>
              <div v-if="p.options.length && !continued.has(m.id)" class="options">
                <button v-for="o in p.options" :key="o" type="button" class="option" :disabled="sending" @click="chat.mode = m.mode; send(o)">{{ o }}</button>
              </div>
              <p v-if="!continued.has(m.id)" class="small faint">Pick one, or type your answer below.</p>
            </div>

            <p v-else-if="p.type === 'error'" class="notice bad" role="alert">{{ p.text }}</p>
          </template>
        </div>
      </template>

      <template v-if="outgoing">
        <div class="msg user mine">
          <div class="who small"><span class="avatar" aria-hidden="true">{{ initials(me?.user?.name ?? '') }}</span><b>You</b><span class="faint">just now</span></div>
          <p class="bubble">{{ outgoing.text }}</p>
        </div>
        <p class="small faint thinking" role="status"><span class="spinner" aria-hidden="true" />{{ outgoing.mode === 'research' ? 'Researching…' : 'Searching the canon…' }}</p>
      </template>
    </div>

    <form class="composer" @submit.prevent="send()">
      <div class="composer-top">
        <div class="modes" role="radiogroup" aria-label="Mode">
          <button
            v-for="md in MODES" :key="md.value" type="button" role="radio" class="mode" :class="md.value"
            :aria-checked="chat.mode === md.value" :title="md.hint" @click="chat.mode = md.value"
          >
            <UiIcon :name="md.icon" :size="14" />{{ md.label }}
          </button>
        </div>
        <span class="small faint mode-hint">{{ modeHint }}</span>
      </div>
      <ul v-if="chips.length" class="chips" aria-label="Attached to your message">
        <li v-for="c in chips" :key="`${c.type}:${c.id}`" class="ctx-chip" :title="c.quote ?? c.label">
          <UiIcon :name="chipIcon(c)" :size="12" />
          <span>{{ c.quote ? `“${c.quote.length > 48 ? `${c.quote.slice(0, 48)}…` : c.quote}”` : c.label }}</span>
          <button type="button" class="chip-x" :aria-label="`Don’t attach ${c.label}`" @click="removeChip(c)"><UiIcon name="close" :size="12" /></button>
        </li>
      </ul>
      <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
      <div class="composer-row">
        <textarea
          ref="box" v-model="text" rows="1" maxlength="2000" :aria-label="chat.mode === 'research' ? 'Research question' : 'Question for the canon'"
          :placeholder="chat.quote ? 'What do you want to know about this?' : chat.mode === 'research' ? 'Ask about the real world…' : 'Ask the canon…'" @keydown="onKey"
        />
        <UiButton type="submit" variant="primary" icon="send" :disabled="sending || !text.trim()" :loading="sending" aria-label="Send">{{ contained ? '' : 'Send' }}</UiButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
.chat-thread { display: flex; flex-direction: column; min-height: 0; }
.chat-thread.contained { height: 100%; }
.thread { display: grid; gap: var(--s-4); align-content: start; padding-bottom: var(--s-4); }
.contained .thread { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--s-3) var(--s-4) var(--s-4); }
.chat-thread:not(.contained) .thread { min-height: calc(100dvh - 22rem - var(--bottom-nav-h, 0px)); }
.msg { display: grid; gap: 6px; min-width: 0; }
.msg.user { justify-items: start; }
.msg.user.mine { justify-items: end; }
.who { display: flex; align-items: center; gap: 6px; color: var(--muted); }
.avatar { display: grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--sunken); color: var(--muted); font-size: 10px; font-weight: 700; }
.mine .avatar { background: var(--accent-soft); color: var(--accent); }
.bubble { margin: 0; max-width: min(85%, 60ch); overflow-wrap: anywhere; white-space: pre-wrap; padding: var(--s-2) var(--s-3); border-radius: var(--r-lg); background: var(--raised); border: 1px solid var(--line); }
.mine .bubble { background: var(--accent-soft); border-color: var(--line-strong); }
.mode-tag { display: inline-flex; align-items: center; gap: 3px; font-size: var(--text-xs); font-weight: 600; }
.mode-tag.research { color: var(--research); }
.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.ctx-chip { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; min-height: 26px; padding: 2px 4px 2px 8px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--sunken); color: var(--muted); font-size: var(--text-xs); }
.ctx-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.chips.sent .ctx-chip { padding-right: 8px; }
.chip-x { display: grid; place-items: center; flex: none; width: 22px; height: 22px; padding: 0; border: 0; border-radius: var(--r-sm); background: none; color: var(--faint); cursor: pointer; }
.chip-x:hover { color: var(--ink); background: var(--line); }
.answer { max-width: 80ch; }
.from { display: grid; gap: var(--s-2); padding: var(--s-3) var(--s-4); border: 1px solid var(--line); border-left-width: 4px; border-radius: var(--r-lg); background: var(--raised); min-width: 0; }
.from-head { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; justify-content: space-between; }
.from-label { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
.from.canon { border-left-color: var(--accent); }
.from.canon .from-label { color: var(--accent); }
.from.canon.neutral { border-left-style: dashed; background: var(--sunken); }
.from.research { border-left-color: var(--research); background: var(--research-soft); }
.from.research .from-label { color: var(--research); }
.from.followup { border-left-color: var(--accent); border-left-style: dotted; }
.from.followup.research { border-left-color: var(--research); }
.from.followup .from-label { color: var(--muted); }
.answer-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.asked, .verdict-text { margin: 0; }
.model { overflow-wrap: anywhere; }
.cited summary { cursor: pointer; font-weight: 600; color: var(--muted); }
.cited { display: grid; gap: var(--s-2); }
.cited-fact { display: grid; gap: 6px; padding: var(--s-3); margin-top: var(--s-2); border-radius: var(--r-md); background: var(--sunken); }
.options { display: flex; flex-wrap: wrap; gap: 6px; }
.option { font: inherit; font-size: var(--text-sm); font-weight: 500; min-height: 34px; padding: 4px 12px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--raised); color: var(--ink); cursor: pointer; }
.option:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.thinking { display: flex; align-items: center; gap: var(--s-2); margin: 0; }
.composer { display: grid; gap: var(--s-2); padding: var(--s-3) 0; background: var(--canvas); border-top: 1px solid var(--line); }
.chat-thread:not(.contained) .composer { position: sticky; bottom: var(--bottom-nav-h, 0px); z-index: 5; }
.contained .composer { padding: var(--s-3) var(--s-4); background: var(--surface); }
.composer .notice { margin: 0; }
.composer-top { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); align-items: center; }
.modes { display: inline-flex; padding: 2px; border: 1px solid var(--line-strong); border-radius: var(--r-md); background: var(--sunken); }
.mode { display: inline-flex; align-items: center; gap: 5px; min-height: 30px; padding: 0 12px; border: 0; border-radius: var(--r-sm); background: none; color: var(--muted); font: 600 var(--text-sm) var(--font-ui); cursor: pointer; }
.mode[aria-checked="true"].canon { background: var(--raised); color: var(--accent); box-shadow: 0 0 0 1px var(--line); }
.mode[aria-checked="true"].research { background: var(--raised); color: var(--research); box-shadow: 0 0 0 1px var(--line); }
.mode-hint { flex: 1 1 200px; min-width: 0; }
.contained .mode-hint { display: none; }
.composer-row { display: flex; gap: var(--s-2); align-items: flex-end; }
.composer-row textarea { flex: 1; min-width: 0; min-height: 0; padding-block: 9px; resize: none; field-sizing: content; max-height: 8lh; font: inherit; }
@media (max-width: 720px) {
  .mode { min-height: 38px; }
  .mode-hint { display: none; }
  .bubble { max-width: 92%; }
}
</style>
