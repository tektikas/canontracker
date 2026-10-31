// Command palette state: open/closed (shared by the shell's buttons and ⌘K), and recent jumps kept per project in this browser.
export const usePaletteOpen = () => useState('palette-open', () => false)

export interface Recent { title: string, sub?: string, to: string, icon: string }
const key = () => `sb-recent-${useMe().value?.current?.project.id ?? ''}`
export function readRecent(): Recent[] {
  try { return JSON.parse(localStorage.getItem(key()) ?? '[]') } catch { return [] }
}
export function pushRecent(r: Recent) {
  try { localStorage.setItem(key(), JSON.stringify([r, ...readRecent().filter(x => x.to !== r.to)].slice(0, 5))) } catch { /* storage blocked: no recents */ }
}
