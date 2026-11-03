// Every keyboard shortcut in the app, in one list. The handlers match keys with pressed(), the buttons show them with
// keyLabel(), and the help page /help/shortcuts is rendered from this list, so the three can't drift apart.
import type { HelpSlug } from '~/help/routes'

interface ShortcutDef {
  /** KeyboardEvent.key, lower-cased ('k', 'escape', 'arrowdown', '/'). */
  key: string
  /** Ctrl on Windows and Linux, ⌘ on Mac. */
  mod?: boolean
  /** true / false must match; left out = either (needed for keys like ? that take Shift on some layouts). */
  shift?: boolean
  label: string
  where: string
  help: HelpSlug
}

export const SHORTCUTS = {
  'app.search': { key: 'k', mod: true, shift: false, label: 'Open search and commands', where: 'Anywhere in the app', help: 'home' },
  'app.ask': { key: 'j', mod: true, shift: false, label: 'Open or close Ask', where: 'Anywhere in the app', help: 'ask' },
  'app.help': { key: '?', label: 'Open help for the page you are on, in a new tab', where: 'Anywhere in the app', help: 'shortcuts' },
  'form.send': { key: 'enter', mod: true, shift: false, label: 'Send the form you are typing in (a chat message, a dialog)', where: 'Anywhere in the app', help: 'shortcuts' },
  'palette.down': { key: 'arrowdown', label: 'Next result', where: 'Search', help: 'home' },
  'palette.up': { key: 'arrowup', label: 'Previous result', where: 'Search', help: 'home' },
  'palette.open': { key: 'enter', label: 'Open the result', where: 'Search', help: 'home' },
  'review.next': { key: 'j', label: 'Next candidate', where: 'Review', help: 'review' },
  'review.prev': { key: 'k', label: 'Previous candidate', where: 'Review', help: 'review' },
  'review.accept': { key: 'a', label: 'Accept', where: 'Review', help: 'review' },
  'review.edit': { key: 'e', label: 'Edit & accept', where: 'Review', help: 'review' },
  'review.reject': { key: 'r', label: 'Reject…', where: 'Review', help: 'review' },
  'review.submit': { key: 'enter', shift: false, label: 'Save & accept, or confirm the reject', where: 'Review', help: 'review' },
  'review.cancel': { key: 'escape', label: 'Cancel the edit or reject', where: 'Review', help: 'review' },
  'reader.find': { key: '/', label: 'Find in the document', where: 'Reader', help: 'reader' },
  'reader.findMod': { key: 'f', mod: true, label: 'Find in the document', where: 'Reader', help: 'reader' },
  'reader.findNext': { key: 'enter', shift: false, label: 'Next match (in the find box)', where: 'Reader', help: 'reader' },
  'reader.findPrev': { key: 'enter', shift: true, label: 'Previous match (in the find box)', where: 'Reader', help: 'reader' },
  'reader.findClose': { key: 'escape', label: 'Close find', where: 'Reader', help: 'reader' },
  'reader.fact': { key: 'f', label: 'Add fact from the selected words', where: 'Reader, with words selected', help: 'reader' },
  'reader.entity': { key: 'e', label: 'Add entity from the selected words', where: 'Reader, with words selected', help: 'reader' },
  'reader.note': { key: 'n', label: 'Add note on the selected words', where: 'Reader, with words selected', help: 'notes' },
  'reader.research': { key: 'r', label: 'Research this', where: 'Reader, with words selected', help: 'research' },
  'reader.continuity': { key: 'c', label: 'Check continuity of the selected words', where: 'Reader, with words selected', help: 'reader' },
  'write.save': { key: 's', mod: true, label: 'Save the draft now', where: 'Write', help: 'write' },
  'write.focus': { key: 'f', mod: true, shift: true, label: 'Turn focus mode on or off', where: 'Write', help: 'write' },
  'write.exitFocus': { key: 'escape', label: 'Leave focus mode', where: 'Write', help: 'write' },
} satisfies Record<string, ShortcutDef>
export type ShortcutId = keyof typeof SHORTCUTS

/** True when the event is this shortcut: same key, same Ctrl/⌘, Shift when the shortcut says, never Alt. */
export function pressed(e: KeyboardEvent, id: ShortcutId): boolean {
  const s: ShortcutDef = SHORTCUTS[id]
  if (e.altKey || !!s.mod !== (e.ctrlKey || e.metaKey)) return false
  if (s.shift !== undefined && s.shift !== e.shiftKey) return false
  return e.key.toLowerCase() === s.key
}

const NAMES: Record<string, string> = { escape: 'Esc', enter: '↵', arrowdown: '↓', arrowup: '↑' }
/** How a shortcut reads on a key cap: "A", "Esc", "Ctrl K" / "⌘K", "Ctrl Shift F" / "⇧⌘F". */
export function keyLabel(id: ShortcutId, mac = false): string {
  const s: ShortcutDef = SHORTCUTS[id]
  const key = NAMES[s.key] ?? s.key.toUpperCase()
  if (!s.mod) return s.shift ? `Shift ${key}` : key
  return mac ? `${s.shift ? '⇧' : ''}⌘${key}` : `Ctrl ${s.shift ? 'Shift ' : ''}${key}`
}
