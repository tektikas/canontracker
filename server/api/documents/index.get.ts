// The Library list: one row per document at its latest version (server/utils/library.ts). Archived documents only with
// ?archived=1 (the Library's Archived filter); pickers and Home never see them.
export default defineEventHandler((event) => {
  const all = latestDocuments()
  return getQuery(event).archived === '1' ? all : all.filter(d => !d.archived_at)
})
