// Help content in one place: the page records (one module per area), the groups on /help, the Start here path, and
// the inline renderer for the three text marks (see types.ts).
import type { HelpGroup, HelpPage } from './types'
import { HELP_SLUGS, type HelpSlug } from './routes'
import documents from './documents'
import canon from './canon'
import tools from './tools'
import studio from './studio'
import concepts from './concepts'

export type { HelpPage, HelpGroup } from './types'
export { HELP_ROUTES, HELP_SLUGS, helpSlugFor, type HelpSlug } from './routes'

const shortcuts: HelpPage = {
  slug: 'shortcuts',
  group: 'concepts',
  title: 'Keyboard shortcuts',
  summary: 'Every keyboard shortcut in Story Bible, from the same list the app uses.',
  where: 'Press `?` on any page in the app for its help; this page lists every key.',
  sections: [{ title: 'Ctrl or ⌘', text: 'Ctrl on Windows and Linux is ⌘ on a Mac. Single-letter keys never fire while you are typing in a field, and Review’s keys are off on touch screens.' }],
  related: ['review', 'reader', 'write', 'ask'],
  keywords: ['keys', 'hotkeys', 'keyboard', 'kbd'],
}

const ALL: HelpPage[] = [...documents, ...canon, ...tools, ...studio, ...concepts, shortcuts]
export const HELP_PAGES = Object.fromEntries(ALL.map(p => [p.slug, p])) as Record<HelpSlug, HelpPage>
/** The page for a slug from a URL; own keys only, so /help/toString or /help/constructor is a 404, not an inherited property. */
export const helpPage = (slug: unknown): HelpPage | undefined => typeof slug === 'string' && Object.hasOwn(HELP_PAGES, slug) ? HELP_PAGES[slug as HelpSlug] : undefined
// A slug without a page (or a page twice) is a programming error: fail loudly at start-up, not with a 404 later.
const missing = HELP_SLUGS.filter(s => !HELP_PAGES[s])
if (missing.length || ALL.length !== HELP_SLUGS.length) throw new Error(`Help pages out of sync with HELP_SLUGS: missing ${missing.join(', ') || 'none'}, ${ALL.length} pages for ${HELP_SLUGS.length} slugs`)

export const HELP_GROUPS: { id: HelpGroup, title: string, text: string }[] = [
  { id: 'start', title: 'Start here', text: 'Sign up, open a sample and find your way around.' },
  { id: 'documents', title: 'Documents and writing', text: 'Import, read, write and record the sources canon comes from.' },
  { id: 'canon', title: 'Canon workflow', text: 'Review candidates, keep canon, settle conflicts and plan changes.' },
  { id: 'tools', title: 'Ask, research and tools', text: 'Questions, outside research, AI runs, measurements, the audit log and export.' },
  { id: 'studio', title: 'Studio and settings', text: 'Your studio, profile, team, projects and agent access.' },
  { id: 'concepts', title: 'How it works', text: 'The ideas behind the screens.' },
]
export const pagesIn = (g: HelpGroup) => ALL.filter(p => p.group === g)

/** Sign up → load a sample → review → canon → conflicts → change impact. */
export const START_PATH: { slug: HelpSlug, step: string }[] = [
  { slug: 'getting-started', step: 'Sign up and open a sample' },
  { slug: 'review', step: 'Review the AI’s candidates' },
  { slug: 'canon', step: 'Browse canon' },
  { slug: 'conflicts', step: 'Settle conflicts' },
  { slug: 'changes', step: 'See a change’s impact' },
]

/** Every word a page holds, for the search box on /help. */
export function helpText(p: HelpPage): string {
  return [p.title, p.summary, p.where, ...(p.keywords ?? []),
    ...(p.see ?? []).flatMap(s => [s.label, s.text]),
    ...(p.tasks ?? []).flatMap(t => [t.title, ...t.steps]),
    ...(p.sections ?? []).flatMap(s => [s.title, s.text, ...(s.points ?? [])]),
  ].filter(Boolean).join(' ').replace(/\*\*|`|\[|\]\([^)]*\)/g, '').toLowerCase()
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** The three marks to HTML. The text is escaped first, so only these tags can come out; links only go to /help pages. */
export function helpInline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b class="ui">$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((\/help(?:\/[a-z-]+)?)\)/g, '<a href="$2">$1</a>')
}
