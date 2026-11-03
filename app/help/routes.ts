// Every page in app/pages, by route name, mapped to the help page its `?` button opens; null = a public or
// sign-in page with no app shell. No imports: nuxt.config.ts reads this table at build time and fails the build when a
// page has no entry or an entry names no page (see the pages:extend hook there).

export const HELP_SLUGS = [
  // Start
  'getting-started',
  // Documents
  'home', 'library', 'reader', 'history', 'script-vs-recording', 'write',
  // Canon workflow
  'review', 'canon', 'entities', 'entity-page', 'conflicts', 'changes', 'tasks', 'notes',
  // Ask and tools
  'ask', 'research', 'agent-activity', 'metrics', 'audit', 'export',
  // Studio
  'settings', 'profile', 'team', 'projects', 'agents-api',
  // Concepts
  'candidates-and-canon', 'evidence', 'conflict-rules', 'change-impact', 'versions-and-recheck', 'merges', 'roles', 'shortcuts', 'glossary',
] as const
export type HelpSlug = typeof HELP_SLUGS[number]

export const HELP_ROUTES: Record<string, HelpSlug | null> = {
  // App pages (the shell shows the `?` button)
  'index': 'home',
  'library': 'library',
  'documents-id': 'reader',
  'documents-id-history': 'history',
  'documents-id-script': 'script-vs-recording',
  'write': 'write',
  'review': 'review',
  'canon': 'canon',
  'entities': 'entities',
  'entities-id': 'entity-page',
  'conflicts': 'conflicts',
  'changes': 'changes',
  'tasks': 'tasks',
  'notes': 'notes',
  'ask': 'ask',
  'research': 'research',
  'research-id': 'research',
  'agents-runs': 'agent-activity',
  'metrics': 'metrics',
  'audit': 'audit',
  'export': 'export',
  'export-print': 'export',
  'settings': 'settings',
  'settings-profile': 'profile',
  'settings-team': 'team',
  'settings-projects': 'projects',
  'settings-projects-id': 'projects',
  'settings-agents': 'agents-api',
  'onboarding': 'getting-started',
  // Public site, sign-in and share pages: no app shell, no `?`
  'login': null,
  'signup': null,
  'invite-token': null,
  'share-token': null,
  'about': null,
  'agents': null,
  'changelog': null,
  'features': null,
  'features-pillar': null,
  'pricing': null,
  'security': null,
  'use-cases-kind': null,
  'help': null,
  'help-slug': null,
}

/** The help page for a route name, or undefined when the page has none. */
export const helpSlugFor = (name: unknown): HelpSlug | undefined => (typeof name === 'string' && HELP_ROUTES[name]) || undefined
