// Help pages (/help, /help/<slug>): one typed record per page. Text uses three marks, rendered by helpInline():
//   **Label**          an exact label the app shows (button, tab, heading, menu item, field). scripts/help-probe.mjs checks
//                      that every one appears in app/ source, so a renamed button fails the probe instead of drifting.
//   `X`                a key or a literal value (D3 14:00, sb_…), shown as code.
//   [text](/help/slug) a link to another help page.
import type { HelpSlug } from './routes'

export type HelpGroup = 'start' | 'documents' | 'canon' | 'tools' | 'studio' | 'concepts'

export interface HelpPage {
  slug: HelpSlug
  group: HelpGroup
  /** The screen's name as the app shows it ("Review", "Library"), or the concept's name. */
  title: string
  /** One sentence: what the screen is for. Also the page's meta description, so keep it under ~160 characters. */
  summary: string
  /** How to get there, e.g. "Sidebar → **Review**". */
  where?: string
  /** A real screenshot in public/shots (name without -light-1280.webp). */
  shot?: { name: string, alt: string }
  /** What you see: the labelled parts of the screen, top to bottom. */
  see?: { label: string, text: string }[]
  /** The 2–4 main tasks, step by step, with the exact UI labels. */
  tasks?: { title: string, steps: string[] }[]
  /** Free sections (concept pages, notes that don't fit a task). */
  sections?: { title: string, text?: string, points?: string[] }[]
  /** Who can do what on this screen. */
  roles?: { role: string, can: string }[]
  related: HelpSlug[]
  /** Extra words people might search for. */
  keywords?: string[]
}
