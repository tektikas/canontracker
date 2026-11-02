// One continuity check with its grounded report, the canon facts it cites (re-read now) and the candidates sent from it.
export default defineEventHandler(event => getContinuityRun(getRouterParam(event, 'id') ?? ''))
