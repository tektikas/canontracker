// The project's entity types in display order, with how many pages use each.
export default defineEventHandler(() => {
  const counts = new Map((useDb().prepare('select kind, count(*) n from entities where project_id = ? group by kind').all(pid()) as { kind: string, n: number }[]).map(r => [r.kind, r.n]))
  return entityTypes().map(t => ({ ...t, pages: counts.get(t.key) ?? 0 }))
})
