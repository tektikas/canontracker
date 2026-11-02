// The chat everywhere outside /ask: the drawer (⌘/Ctrl+J, the floating button) and the panels docked in the writer and
// reader share this one state, so "Research this" and the shortcut land in whichever is on screen.
export type ChatMode = 'canon' | 'research'
export interface ChatChip { type: 'document' | 'passage' | 'entity' | 'conflict', id: string, label: string, quote?: string }

interface ChatState {
  open: boolean // the drawer
  conv: string | null // the conversation shown; null = a new one (sent on the first message)
  picked: boolean // false until something chose a conversation; the drawer then opens the latest one
  mode: ChatMode
  quote: ChatChip | null // a selection to ask about (Research this)
  prefill: string // text to put in the composer (the writer's selection)
  tick: number // bumped on every open request: the visible chat focuses its composer
  check: boolean // run a continuity check of the quote as soon as the chat shows it (the reader's "Check continuity")
  dock: string | null // a page showing its own chat panel (reader, writer): requests go there instead of the drawer
}
export const useChat = () => useState<ChatState>('chat', () => ({ open: false, conv: null, picked: false, mode: 'canon', quote: null, prefill: '', tick: 0, check: false, dock: null }))
// What the current page is about (document, passage, entity): offered as removable chips on the next message.
export const useChatPage = () => useState<ChatChip[]>('chat-page', () => [])

export function openChat(o: { fresh?: boolean, mode?: ChatMode, quote?: ChatChip, prefill?: string, check?: boolean } = {}) {
  const s = useChat().value
  if (o.fresh) Object.assign(s, { conv: null, picked: true })
  if (o.check) s.check = true
  if (o.mode) s.mode = o.mode
  if (o.quote) s.quote = o.quote
  if (o.prefill) s.prefill = o.prefill
  s.tick++
  if (!s.dock) s.open = true
}

/** A page says what it is about; cleared when it unmounts. */
export function useChatContext(chips: () => ChatChip[]) {
  const page = useChatPage()
  watchEffect(() => { page.value = chips() })
  onBeforeUnmount(() => { page.value = [] })
}

/** A page with its own chat panel takes the open requests while `on` is true. */
export function useChatDock(name: string, on: () => boolean) {
  const s = useChat()
  watchEffect(() => {
    if (on()) s.value.dock = name
    else if (s.value.dock === name) s.value.dock = null
  })
  onBeforeUnmount(() => { if (s.value.dock === name) s.value.dock = null })
}

// "3 min ago", "yesterday": for conversation lists and message times.
export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 6e4)
  if (mins < 1) return 'just now'
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  return mins < 60 ? rtf.format(-mins, 'minute') : mins < 1440 ? rtf.format(-Math.round(mins / 60), 'hour') : rtf.format(-Math.round(mins / 1440), 'day')
}
