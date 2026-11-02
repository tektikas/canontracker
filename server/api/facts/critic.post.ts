// Ask the AI critic for an opinion on pending candidates: { ids } (one from a candidate's "Ask the AI critic", or the queue's
// candidates without a current opinion). Editors and up. Writes opinions only (critic_opinions); no fact changes. A live
// failure is returned as an error and recorded in model_calls; it never falls back to recorded output.
export default defineEventHandler(async (event) => {
  requireRole('editor')
  const body = await readObject<{ ids?: unknown }>(event)
  const ids = body?.ids
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(x => typeof x === 'string'))
    throw createError({ statusCode: 400, statusMessage: 'IDS_REQUIRED', message: 'Send the candidates to read as ids: [...] (at most 500).' })
  if (!criticEffort()) throw createError({ statusCode: 409, statusMessage: 'CRITIC_OFF', message: 'The AI critic is turned off on this server.' })
  return runCritic(ids)
})
