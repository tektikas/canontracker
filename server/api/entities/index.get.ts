// Every wiki page in the project, with how many canon facts name it and the first of them (shown when the page has no summary).
// Also files pages for new names in accepted canon.
export default defineEventHandler(() => {
  syncEntities()
  const { counts, first } = canonNameCounts()
  return listEntities().map((e) => {
    const all = namesOf(e)
    const names = new Set(all.map(normName))
    return {
      id: e.id, name: e.name, analysis_name: analysisName(e), kind: e.kind, summary: e.summary, aliases: aliasesOf(e), portrait: portraitUrl(e), origin: e.origin, updated_at: e.updated_at,
      // Every name that links here (title, aliases, analysis name, merged names), for read-time mention links.
      names: all, facts: [...names].reduce((n, k) => n + (counts.get(k) ?? 0), 0),
      first_fact: [...names].map(k => first.get(k)).find(Boolean) ?? null,
    }
  })
})
