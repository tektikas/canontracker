// Light/dark: follows the system until a person toggles it; the choice is kept in this browser (nuxt.config.ts applies it before paint).
export function toggleTheme() {
  const root = document.documentElement
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  const next = dark ? 'light' : 'dark'
  root.dataset.theme = next
  try { localStorage.setItem('sb-theme', next) } catch { /* private mode: the choice lasts for this page only */ }
  return next
}
