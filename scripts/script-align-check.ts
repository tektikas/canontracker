// Self-check for script vs recording alignment (server/utils/script-align.ts). Run: node scripts/script-align-check.ts
// The table read from the video (Watson meets Holmes, one Muse turn per line, its doubled words and spellings kept): a word
// changed or added at the end of a line stays on that line, it doesn't move to the next one.
import assert from 'node:assert/strict'
import { diffSeq } from '../server/utils/diff.ts'
import type { PassageRow } from '../server/utils/db.ts'
import { alignScript, scriptLines } from '../server/utils/script-align.ts'

Object.assign(globalThis, { diffSeq }) // script-align.ts reaches it as a Nitro auto-import

const SCRIPT = `# Table read: Watson meets Holmes

(A Study in Scarlet, chapter 1. The chemical laboratory at Bart's. Holmes bends over a test tube.)

STAMFORD: Dr. Watson, Mr. Sherlock Holmes.

HOLMES: How are you? You have been in Afghanistan, I perceive.

WATSON: How on earth did you know that?

HOLMES: No matter. The question now is about hemoglobin.

STAMFORD: Watson came home from the war a few months ago.

WATSON: My wound is in the left shoulder.

HOLMES: I have my eye on rooms in Baker Street, which would suit us down to the ground.

WATSON: I should like that. My nerves are shaken, and I want quiet.
`
// Passages as the importer cuts them: one per blank-line block, with its first and last line.
function passagesOf(content: string, doc: string): PassageRow[] {
  const out: PassageRow[] = []
  content.split('\n').forEach((line, i) => {
    if (!line.trim()) return
    const last = out.at(-1)
    if (last && last.end_line === i) { last.text += `\n${line}`; last.end_line = i + 1 }
    else out.push({ id: `${doc}-${out.length}`, document_id: doc, ordinal: out.length, start_line: i + 1, end_line: i + 1, text: line })
  })
  return out
}
const turns = (lines: string[]): PassageRow[] => lines.map((text, i) => ({
  id: `t-${i}`, document_id: 't', ordinal: i, start_line: i * 2 + 1, end_line: i * 2 + 1, text, start_ms: i * 4000, end_ms: i * 4000 + 3000, speaker: null,
}))
const script = scriptLines(passagesOf(SCRIPT, 's'), SCRIPT)
const plain = (p?: { text: string }[]) => p?.map(x => x.text).join('').trim()
const marked = (p?: { text: string, mark: boolean }[]) => p?.filter(x => x.mark).map(x => x.text.trim()).join(' ')
const rowOf = (rows: ReturnType<typeof alignScript>, line: string) => {
  const r = rows.find(x => plain(x.script?.pieces) === line)
  assert.ok(r, `row for ${line}`)
  return r
}

// What Muse heard (real output from the take, with Watson's last word changed by the actor: shoulder → leg).
const take = turns([
  'Doctor Watson, Mister Sherlock Holmes.',
  'How are are you you? You have been in Afghanistan, I perceive.',
  'How on earth did you know that?',
  'No matter. The question now is about haemoglobin.',
  'Watson came home from from the war a few months ago.',
  'My wound is in the left leg.',
  'I have my eye on rooms in Berkshires, which would suit us down to the ground.',
  'I should like that. My nerves are shaken, and I want quiet.',
])
const rows = alignScript(script, take)

// The changed last word stays on its own line, on both sides.
const wound = rowOf(rows, 'My wound is in the left shoulder.')
assert.equal(wound.kind, 'changed')
assert.equal(plain(wound.spoken?.pieces), 'My wound is in the left leg.')
assert.equal(marked(wound.script?.pieces), 'shoulder.')
assert.equal(marked(wound.spoken?.pieces), 'leg.')
assert.deepEqual([...wound.spans.keys()], ['t-5'], 'the wound line is placed in its own turn only')
const hemo = rowOf(rows, 'No matter. The question now is about hemoglobin.')
assert.equal(plain(hemo.spoken?.pieces), 'No matter. The question now is about haemoglobin.')
assert.deepEqual([...hemo.spans.keys()], ['t-3'])
// The next lines don't pick the word up.
const next = rowOf(rows, 'I have my eye on rooms in Baker Street, which would suit us down to the ground.')
assert.equal(plain(next.spoken?.pieces), 'I have my eye on rooms in Berkshires, which would suit us down to the ground.')
assert.deepEqual([...next.spans.keys()], ['t-6'])
const stamford = rowOf(rows, 'Watson came home from the war a few months ago.')
assert.equal(plain(stamford.spoken?.pieces), 'Watson came home from from the war a few months ago.')
assert.deepEqual([...stamford.spans.keys()], ['t-4'])
// Every other line is in its own turn too, and nothing is "added".
assert.equal(rows.filter(r => r.kind === 'added').length, 0, 'no added rows')
for (const r of rows) assert.equal(r.spans.size, 1, `${plain(r.script?.pieces)} spans one turn`)

// A word added at the end of a line (its own turn) stays there; a stray word opening the next turn joins that line.
const extra = alignScript(script, turns([
  'Dr. Watson, Mr. Sherlock Holmes.',
  'How are you? You have been in Afghanistan, I perceive.',
  'How on earth did you know that?',
  'No matter. The question now is about hemoglobin.',
  'Watson came home from the war a few months ago.',
  'My wound is in the left shoulder, sir.',
  'Well, I have my eye on rooms in Baker Street, which would suit us down to the ground.',
  'I should like that. My nerves are shaken, and I want quiet.',
]))
const sir = rowOf(extra, 'My wound is in the left shoulder.')
assert.equal(plain(sir.spoken?.pieces), 'My wound is in the left shoulder, sir.')
assert.equal(marked(sir.spoken?.pieces), 'sir.')
const well = rowOf(extra, 'I have my eye on rooms in Baker Street, which would suit us down to the ground.')
assert.equal(marked(well.spoken?.pieces), 'Well,')

// The whole take in one turn: a changed last word still belongs to the line whose words it replaced.
const one = alignScript(script, turns([take.map(t => t.text).join(' ')]))
const woundOne = rowOf(one, 'My wound is in the left shoulder.')
assert.equal(marked(woundOne.spoken?.pieces), 'leg.')
assert.equal(marked(rowOf(one, 'I have my eye on rooms in Baker Street, which would suit us down to the ground.').spoken?.pieces), 'Berkshires,')

console.log('script-align-check: ok')
