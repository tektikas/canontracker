// "uses_on_arin" -> "uses on Arin": underscores to spaces, words that match a known entity keep the entity's casing.
export function humanizePredicate(predicate: string, entities: Iterable<string> = []): string {
  const names = new Map<string, string>()
  for (const e of entities) names.set(e.toLowerCase(), e)
  return predicate.split('_').map(w => names.get(w.toLowerCase()) ?? w).join(' ')
}

// "uses_on_arin" + object "Chord Stone" -> "uses Chord Stone on Arin": a trailing "<preposition> <entity>" wraps the object.
export function factPhrase(f: Record<string, any>, entities: Iterable<string> = []): string {
  const words = humanizePredicate(f.predicate, entities).split(' ')
  const PREP = new Set(['on', 'at', 'to', 'for', 'with', 'by', 'from'])
  if (f.object && words.length >= 3 && PREP.has(words.at(-2)!)) {
    return [...words.slice(0, -2), f.object, ...words.slice(-2)].join(' ')
  }
  return [words.join(' '), f.object].filter(Boolean).join(' ')
}
