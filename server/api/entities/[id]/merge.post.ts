// Merge this page (the duplicate) into another. { into, preview: true } runs the merge and rolls it back, so the preview
// shows exactly what would move, close or go stale.
export default defineEventHandler(async (event) => {
  const body = await readObject<{ into?: string, preview?: boolean }>(event)
  if (!body.preview) requireHuman(event) // a merge is an identity decision; the preview changes nothing
  const src = getEntity(getRouterParam(event, 'id')!)
  const dst = getEntity(String(body.into ?? ''))
  const plan = planMerge(src, dst)
  const { apply, ...shown } = plan
  if (body.preview) {
    const { audit_id: _, ...effects } = dryRun(() => mergeEntities(src, dst, plan))
    return { ...shown, ...effects }
  }

  const result = tx(() => mergeEntities(src, dst, plan))
  if (plan.portrait === 'move') movePortrait(src.id, dst.id)
  else removePortrait(src.id)
  return { id: dst.id, facts: plan.facts.length, ...result }
})
