// Unauthenticated liveness: used by the container healthcheck and the deploy pipeline. Skips the project guard (see access.ts).
export default defineEventHandler(() => {
  return { ok: true, schema: schemaVersion(), model: modelInfo().mode }
})
