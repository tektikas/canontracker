// Every wiki page in the project, with how many canon facts name it. Also files pages for new names in accepted canon.
export default defineEventHandler(() => {
  syncEntities()
  const facts = useDb().prepare(`select subject, object from facts where project_id = ? and status = 'canon'`).all(pid()) as { subject: string, object: string | null }[]
  const counts = new Map<string, number>()
  for (const f of facts) for (const n of new Set([normName(f.subject), normName(f.object)])) if (n) counts.set(n, (counts.get(n) ?? 0) + 1)
  return listEntities().map((e) => {
    const all = namesOf(e)
    const names = new Set(all.map(normName))
    return {
      id: e.id, name: e.name, analysis_name: analysisName(e), kind: e.kind, summary: e.summary, aliases: aliasesOf(e), portrait: portraitUrl(e), origin: e.origin, updated_at: e.updated_at,
      // Every name that links here (title, aliases, analysis name, merged names), for read-time mention links.
      names: all, facts: [...names].reduce((n, k) => n + (counts.get(k) ?? 0), 0),
    }
  })
})
