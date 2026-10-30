// Resets the local demo database and imports the synthetic "Broken Tide" set: lore first, then scenes in order.
export default defineEventHandler(async () => {
  resetData()
  const assets = useStorage('assets:server')
  const files = (await assets.getKeys('broken-tide:docs')).map(k => k.split(':').pop()!)
    .sort((a, b) => Number(/^S\d/.test(a)) - Number(/^S\d/.test(b)) || a.localeCompare(b))
  const results = []
  for (const filename of files) {
    const content = await assets.getItem<string>(`broken-tide:docs:${filename}`)
    if (content) results.push(await importDocument(filename, String(content)))
  }
  return { results }
})
