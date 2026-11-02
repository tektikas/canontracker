// Offline check of "The Ashbell Pass" demo content (server/assets/ashbell-pass). Run: node scripts/ashbell-corpus-check.mjs
// Uses the app's own splitPassages / findQuotePassage / parseStoryRange, so "verified" here means what the importer means.
// Checks what the writers could not: word counts, anchors unique across the corpus, every candidate quote verbatim in its
// doc except the one planted hallucination, unique statements, free candidates never carrying time / rules / reserved names,
// no planted candidate shadowed by an earlier duplicate at import, gold.json consistent with the corpus, and S03 v2 being
// v1 plus exactly the three designed edits. Exits non-zero on the first failing group.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { foldQuoteText, quoteMatches } from '../server/utils/quote.ts'

Object.assign(globalThis, { foldQuoteText, quoteMatches }) // db.ts reaches them as Nitro auto-imports
const { findQuotePassage } = await import('../server/utils/db.ts')
const { splitPassages } = await import('../server/utils/importer.ts')
const { parseStoryRange } = await import('../shared/utils/story-time.ts')

const A = new URL('../server/assets/ashbell-pass/', import.meta.url)
const json = f => JSON.parse(readFileSync(new URL(f, A), 'utf8'))
const manifest = json('manifest.json')
const candidates = json('candidates.json')
const anchors = json('anchors.json')
const gold = json('gold.json')
const ruleChecks = json('rule-checks.json')
const entities = json('entities.json')
const text = Object.fromEntries(readdirSync(new URL('docs/', A)).map(f => [f, readFileSync(new URL(`docs/${f}`, A), 'utf8')]))
const passages = Object.fromEntries(Object.entries(text).map(([f, t]) => [f, splitPassages(t)]))
const ok = (label, detail = '') => console.log(`ok  ${label}${detail ? ` (${detail})` : ''}`)
const ws = s => s.replace(/\s+/g, ' ').trim()
const files = Object.keys(manifest.docs)

// 1. Documents, titles, folders, kinds, tags.
assert.deepEqual(Object.keys(text).sort(), [...files].sort(), 'docs/ matches manifest')
for (const [f, m] of Object.entries(manifest.docs)) {
  assert.ok(text[f].startsWith(`# ${m.title}\n\n`), `${f} starts with "# ${m.title}" and a blank line`)
  assert.equal(text[f].match(/^# /gm).length, 1, `${f} has one H1`)
  assert.ok(['scene', 'lore', 'character', 'quest', 'dialogue'].includes(m.kind), `${f} kind`)
  assert.ok(m.tags.every(t => t in manifest.tags), `${f} tags`)
  assert.equal(m.kind === 'scene', /^S\d+/.test(f), `${f}: only S-files are scenes`)
}
ok('28 documents, one H1 each, kinds and tags from the manifest', `${files.length} docs, ${new Set(files.map(f => manifest.docs[f].folder)).size} folders`)

// 2. Words: the corpus total and each doc within ±10% of its target.
const words = f => text[f].split(/\s+/).filter(Boolean).length
const total = files.reduce((n, f) => n + words(f), 0)
assert.ok(total >= 22000 && total <= 25000, `word total ${total} within 22–25k`)
for (const f of files) assert.ok(Math.abs(words(f) - manifest.docs[f].words) <= manifest.docs[f].words * 0.1, `${f}: ${words(f)} words vs ${manifest.docs[f].words}`)
ok('word counts', `${total} words, every doc within ±10%`)

// 3. Banned words (keep the "unknown" questions unknown and the hallucination unfindable).
for (const f of files) {
  for (const re of [/\bfavou?rite\b/i, /\bsongs?\b/i, /\bborn\b/i, /third lamp/i, /founded by Aldous/i, ...(f === 'dlg-town-crier.md' ? [] : [/Salt Gate/])])
    assert.ok(!re.test(text[f]), `${f} contains banned ${re}`)
}
ok('no banned words')

// 4. Anchors: exactly once in the whole corpus, inside one paragraph of their own doc.
const corpus = files.map(f => ws(text[f]))
let anchorCount = 0
for (const [f, list] of Object.entries(anchors)) {
  for (const a of list) {
    const n = corpus.reduce((k, t) => k + t.split(ws(a)).length - 1, 0)
    assert.equal(n, 1, `anchor appears ${n}× in the corpus: ${a}`)
    assert.ok(passages[f].some(p => ws(p.text).includes(ws(a))), `anchor not inside one paragraph of ${f}: ${a}`)
    anchorCount++
  }
}
ok('anchors unique across the corpus, each inside one paragraph', `${anchorCount} anchors`)

// 5. Candidate shape, names, unique statements, verbatim quotes (all but the one hallucination).
const names = new Set([...entities.map(e => e.name), 'Lamplighter', 'Salt Gate'])
const RESERVED = new Set(['Ashbell', 'Lamplighter', 'Salt Gate'])
const SPECIAL_PREDICATES = new Set(['rule', 'travel_time', 'sworn_to', 'sibling_of'])
const planted = new Set([...gold.passages.map(p => p.statement), ...gold.hallucinated])
const all = files.flatMap(f => (candidates[f] ?? []).map(c => ({ ...c, file: f })))
const statements = new Map()
const unverified = []
for (const c of all) {
  assert.ok(['character', 'location', 'relationship', 'event', 'rule', 'claim'].includes(c.kind), `kind: ${c.statement}`)
  assert.ok(names.has(c.subject) && (c.object == null || names.has(c.object)), `names in the register: ${c.statement}`)
  assert.ok(/^[a-z_]+$/.test(c.predicate), `snake_case predicate: ${c.statement}`)
  assert.ok(!statements.has(c.statement), `duplicate statement in ${statements.get(c.statement)} and ${c.file}: ${c.statement}`)
  statements.set(c.statement, c.file)
  if (c.time) assert.ok(!parseStoryRange(c.time.from, c.time.to).bad, `story time parses: ${c.statement}`)
  if (!findQuotePassage(passages[c.file], c.quote)) unverified.push(c.statement)
  const special = !!c.time || c.kind === 'rule' || RESERVED.has(c.subject) || RESERVED.has(c.object) || SPECIAL_PREDICATES.has(c.predicate)
  if (special) assert.ok(planted.has(c.statement), `free candidate carries time / rule / reserved name: ${c.statement}`)
}
for (const f of files) assert.ok(candidates[f].length >= 8 && candidates[f].length <= 16, `${f}: ${candidates[f].length} candidates`)
assert.deepEqual(unverified, gold.hallucinated, 'only the planted hallucination is unverifiable')
ok('candidates', `${all.length} candidates, statements unique, names from the register, only "${gold.hallucinated[0]}" unverifiable`)
for (const s of planted) assert.ok(statements.has(s), `planted candidate present: ${s}`)
ok('free candidates carry no time, rule or reserved name', `${planted.size} planted`)

// 6. Import order dedup (importer.ts extractInto): a candidate whose statement or kind/names/value/time repeats an earlier one
// is skipped. A planted one must never be shadowed; a shadowed free one is reported.
const order = [...files].sort((a, b) => Number(/^S\d/.test(a)) - Number(/^S\d/.test(b)) || a.localeCompare(b))
const norm = s => (s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[.!?\s]+$/, '').trim()
const seen = new Map()
const shadowed = []
for (const f of order) {
  for (const c of candidates[f]) {
    const r = parseStoryRange(c.time?.from, c.time?.to)
    const keys = [`s:${norm(c.statement)}`, `k:${[c.kind, norm(c.subject), norm(c.predicate), norm(c.object), norm(c.value == null ? '' : String(c.value)), r.from ?? '', r.to ?? '', c.time ? (c.time.precision ?? 'exact') : ''].join('|')}`]
    const by = keys.map(k => seen.get(k)).find(Boolean)
    if (by) {
      assert.ok(!planted.has(c.statement), `planted candidate shadowed at import by "${by}": ${c.statement}`)
      shadowed.push(`${c.statement} (by "${by}")`)
      continue
    }
    for (const k of keys) seen.set(k, c.statement)
  }
}
ok('no planted candidate is shadowed at import', shadowed.length ? `free ones skipped: ${shadowed.join('; ')}` : 'none skipped')

// 7. gold.json agrees with the corpus.
for (const p of gold.passages) {
  const c = all.find(x => x.statement === p.statement)
  assert.equal(c?.file, p.file, `gold passage file: ${p.statement}`)
  assert.equal(findQuotePassage(passages[p.file], c.quote).passage.start_line, p.line, `gold passage line: ${p.statement}`)
}
const goldStatements = [...gold.conflicts, ...gold.false_alarms, ...gold.after_merge, ...gold.after_change].flatMap(g => g.statements)
  .concat(gold.figurative, gold.hallucinated, gold.recheck.outdated_gone, gold.recheck.outdated_twice, gold.recheck.unchanged, gold.no_conflict_pairs.flat())
for (const s of goldStatements) assert.ok(statements.has(s) || s === gold.after_change[0].rule_statement, `gold statement is a candidate: ${s}`)
for (const f of [...gold.impact.expected_scenes, ...gold.impact.excluded_scenes]) assert.equal(manifest.docs[f]?.kind, 'scene', `impact scene ${f}`)
ok('gold.json statements, files and lines match the corpus', `${gold.passages.length} passages`)

// 8. Recorded rule checks: each phrase picks exactly one rule (R1 v1, R2, or the proposed R1 v2) and names real statements.
const rules = all.filter(c => c.kind === 'rule' && c.predicate === 'rule').map(c => c.statement).concat(gold.after_change[0].rule_statement)
for (const r of ruleChecks) {
  assert.equal(rules.filter(s => s.includes(r.rule_contains)).length, 1, `rule_contains "${r.rule_contains}" matches one rule`)
  for (const v of r.violations) assert.ok(statements.has(v.statement), `violation statement is a candidate: ${v.statement}`)
}
ok('rule-checks.json phrases are disjoint and name real statements')

// 9. S03 v2 is v1 with exactly the three designed edits.
const v1 = text['S03-the-kettle-and-coal.md']
const v2 = readFileSync(new URL('v2/S03-the-kettle-and-coal.md', A), 'utf8')
const want = `${v1.replace('Mother Brisk pours Ves a cup of pine tea and refuses her coin.', 'Mother Brisk pours Ves a cup of pine tea and takes her coin without a word.')
  .replace('"Not tonight," Brisk says. "Not with ash in the wind."', '“Not tonight,” Brisk says.\n“Not with ash in the wind.”').trimEnd()}\n\nVes listens to the town settle around her. The lamps on Kiln Street go dark at midnight, every night, without fail.\n`
assert.equal(v2, want, 'S03 v2 = v1 + the three edits')
const p1 = new Set(splitPassages(v1).map(p => p.text))
const p2 = splitPassages(v2).map(p => p.text)
assert.equal(p2.filter(t => !p1.has(t)).length, 3, 'v2 changes three passages')
ok('S03 v2 is v1 plus exactly the three edits', '3 changed passages')

console.log(`ashbell corpus check passed: ${files.length} docs, ${total} words, ${all.length} candidates`)
