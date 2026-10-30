// Unauthenticated liveness: used by the container healthcheck and the deploy pipeline. Skips the project guard (see access.ts).
export default defineEventHandler(() => {
  useDb().prepare('select 1').get()
  return { ok: true, schema: SCHEMA_VERSION, model: modelInfo().mode }
})
