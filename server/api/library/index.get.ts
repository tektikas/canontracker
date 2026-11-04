// Folders and tags of the current project, each with how many documents (not versions) carry it.
export default defineEventHandler(() => {
  const db = useDb()
  const folders = db.prepare(`select f.id, f.name, f.parent_id, (select count(distinct d.filename) from documents d where d.project_id = f.project_id and d.folder_id = f.id) documents
    from folders f where f.project_id = ? order by lower(f.name)`).all(pid()) as unknown as (FolderRow & { documents: number })[]
  const tags = db.prepare(`select t.id, t.name, t.color, (select count(*) from document_tags dt where dt.project_id = t.project_id and dt.tag_id = t.id) documents
    from tags t where t.project_id = ? order by lower(t.name)`).all(pid()) as unknown as (TagRow & { documents: number })[]
  // Names sort with numbers in order ("Season 2" before "Season 10").
  const natural = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' })
  return { folders: folders.sort(natural), tags: tags.sort(natural), colors: TAG_COLORS, kinds: DOCUMENT_KINDS }
})
