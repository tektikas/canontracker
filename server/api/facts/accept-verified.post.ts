// Accept a list of candidates in one human decision. The client sends exactly the candidates it showed the person in the
// confirmation sheet, each with the fingerprint of what the sheet displayed (shared/utils/review.ts). If any of them changed
// since (evidence moved to a new version, the source got a newer version, a merge now renames it, the wording changed), the
// whole decision is refused with 409 and those ids are named: nothing is accepted until the person reads the list again and
// confirms. Otherwise only those still pending and with a quote verbatim in their source become canon; the rest are skipped
// and named (already decided, quote not found, not in this project). Each accepted candidate gets its own audit event with
// the actor, plus one summary event for the decision. Sending the same list again accepts nothing new.
// `critic: true` is the "Accept all the AI critic keeps" sheet: each fingerprint then also covers the Critic's opinion the sheet
// showed (a newer opinion, one on an older form of the candidate, or canon about its names changing since the Critic read it,
// refuses the lot with 409), and a candidate whose opinion is not a current "keep" read against today's canon is skipped
// (critic_not_keep). The Critic only narrows the list; the person's confirmation is the decision.
const MAX = BULK_MAX

export default defineEventHandler(async (event) => {
  requireHuman(event)
  requireRole('editor')
  const body = await readObject<{ items?: unknown }>(event)
  const items = body?.items as { id: string, fingerprint: string }[] | undefined
  const critic = (body as { critic?: unknown } | null)?.critic === true
  if (!Array.isArray(items) || !items.length || !items.every(x => x && typeof x.id === 'string' && typeof x.fingerprint === 'string'))
    throw createError({ statusCode: 400, statusMessage: 'ITEMS_REQUIRED', message: 'Send the candidates you showed as items: [{ id, fingerprint }].' })
  if (items.length > MAX) throw createError({ statusCode: 400, statusMessage: 'TOO_MANY', message: `Accept at most ${MAX} candidates at once.` })

  const db = useDb()
  const batch = newId('bulk')
  const ready: Fact[] = []
  const changed: string[] = []
  const skipped: { id: string, reason: 'not_found' | 'already_decided' | 'unverified' | 'critic_not_keep' }[] = []
  const opinion = new Map<string, string>()
  return tx(() => {
    for (const { id, fingerprint } of new Map(items.map(x => [x.id, x])).values()) {
      const fact = db.prepare('select * from facts where id = ? and project_id = ?').get(id, pid()) as unknown as Fact | undefined
      if (!fact) skipped.push({ id, reason: 'not_found' })
      else if (fact.status !== 'pending') skipped.push({ id, reason: 'already_decided' })
      else if (!hasVerifiedQuote(id)) skipped.push({ id, reason: 'unverified' })
      else {
        const listed = listFacts('f.id = ?', id)[0]!
        const now = withCritic([{ ...listed, identity: identityOf(listed) }])[0]!
        if (candidateFingerprint(now, critic) !== fingerprint) changed.push(id)
        else if (critic && !(now.critic?.verdict === 'keep' && now.critic.current && !now.critic.canon_changed)) skipped.push({ id, reason: 'critic_not_keep' })
        else {
          ready.push(fact)
          if (critic) opinion.set(id, now.critic!.id)
        }
      }
    }
    if (changed.length) {
      throw createError({ statusCode: 409, statusMessage: 'CHANGED_SINCE_SHOWN', message: `${changed.length === 1 ? '1 candidate has' : `${changed.length} candidates have`} changed since you opened the list. Nothing was accepted; review the list again.`, data: { changed } })
    }
    for (const fact of ready) acceptCandidate(fact, 'accept', {}, null, { bulk: batch, ...(critic && { critic_opinion_id: opinion.get(fact.id) }) })
    const accepted = ready.map(f => f.id)
    if (accepted.length) audit('candidate.bulk_accepted', 'project', pid(), { batch, accepted, skipped, ...(critic && { via: 'critic_keeps' }) })
    return { accepted, skipped }
  })
})
