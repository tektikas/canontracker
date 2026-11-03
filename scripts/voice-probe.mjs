// Voice probe against a running server in recorded mode (the default): node scripts/voice-probe.mjs http://localhost:<port>
// The Ashbell Pass with S05 (Rourke on watch at the Bell Gate, D2 21:00–22:00) accepted, then the sample take
// public/samples/harl-crier-take.wav uploaded as a recording linked to dlg-town-crier.md: the recorded transcript becomes a
// read-only document version with timed passages, extraction runs on it (a verbatim, timed citation), the audio is served
// only through the guard (byte ranges for seeking), and the script diff keeps line 1, flags the changed Rourke bark against
// canon (EXACT_TIME_LOCATION_OVERLAP). The same audio again is a duplicate, the transcript can't be edited, and recorded
// mode refuses unknown audio without storing anything. Guards: another studio 404, a viewer can't upload (but may dictate),
// unsupported, oversize and over-long audio are refused with a plain message (a long compressed file before it is converted).
// Two candidates in the take that clash with each other are "in this take", not canon conflicts. Hourly audio limits: 429 per
// person (dictation, recordings) and per project. Needs ffmpeg on the probe's machine too (to make the compressed files).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
const SAMPLE = readFileSync(new URL('../public/samples/harl-crier-take.wav', import.meta.url))
const FIXTURE = JSON.parse(readFileSync(new URL('../server/assets/ashbell-pass/recordings.json', import.meta.url), 'utf8'))[0]

function client() {
  let cookie = ''
  const call = async (path, { method = 'GET', body, form, headers = {} } = {}) => {
    const res = await fetch(base + path, { method, headers: { ...(form ? {} : { 'content-type': 'application/json' }), cookie, ...headers }, body: form ?? (body && JSON.stringify(body)) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const buf = Buffer.from(await res.arrayBuffer())
    let data
    try { data = JSON.parse(buf.toString('utf8')) } catch { data = buf }
    return { status: res.status, data, headers: res.headers }
  }
  call.cookie = () => cookie
  return call
}
// A chunked multipart body (no Content-Length) of `mb` megabytes: the server must answer 413 while it streams in. EPIPE or
// ECONNRESET after the answer arrived is expected (the server closes); without an answer the check fails.
const chunkedUpload = (c, mb) => new Promise((resolve, reject) => {
  let status
  const bnd = `----voice${run}`
  const req = request(`${base}/api/recordings`, { method: 'POST', headers: { cookie: c.cookie(), 'content-type': `multipart/form-data; boundary=${bnd}`, 'transfer-encoding': 'chunked' } }, (res) => {
    status = res.statusCode; res.resume(); resolve(status); req.destroy()
  })
  req.on('error', (e) => { if (status === undefined) reject(e) })
  const chunk = Buffer.alloc(1024 * 1024)
  let sent = 0
  req.write(`--${bnd}\r\ncontent-disposition: form-data; name="file"; filename="huge.wav"\r\n\r\n`)
  const pump = () => {
    while (status === undefined && !req.destroyed && sent < mb) {
      sent++
      if (!req.write(chunk)) return req.once('drain', pump)
    }
    if (sent >= mb) req.end(`\r\n--${bnd}--\r\n`)
  }
  pump()
})
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label} (${JSON.stringify(actual).slice(0, 90)})`) }
async function account(name) {
  const c = client()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@voice.test`, password: 'correct horse' } })).status, 200)
  return c
}
const audioForm = (name, data, fields = {}) => {
  const f = new FormData()
  f.append('file', new Blob([data]), name)
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}
// A mono 16-bit WAV of `seconds` of a quiet tone: real audio no sample has a transcript for.
function toneWav(seconds, rate = 16000, channels = 1) {
  const data = Buffer.alloc(seconds * rate * 2 * channels)
  for (let i = 0; i < seconds * rate * channels; i++) data.writeInt16LE(Math.round(Math.sin(i / 8) * 2000), i * 2)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22)
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2 * channels, 28); h.writeUInt16LE(2 * channels, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}
// Mono 16 kHz silence as a plain WAV (no ffmpeg on the server side: the shape Muse takes).
const silenceWav = seconds => wavOf(Buffer.alloc(seconds * 16000 * 2))
function wavOf(data) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}
// 31 minutes of silence, compressed (ffmpeg): a FLAC that states its length, and a live WebM that states none.
const tmp = mkdtempSync(join(tmpdir(), 'voice-probe-'))
const silence = (name, args) => {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '1860', ...args, join(tmp, name)])
  return readFileSync(join(tmp, name))
}
const LONG_FLAC = silence('long.flac', ['-c:a', 'flac'])
const LONG_WEBM = silence('long.webm', ['-c:a', 'libopus', '-live', '1', '-f', 'webm'])
rmSync(tmp, { recursive: true, force: true })

const a = await account('Ada')
const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Voice Studio' } })).data
await a('/api/projects', { method: 'POST', body: { name: 'Ashbell', studio_id: studio.id } })
check('Ashbell Pass loads', (await a('/api/demo/load', { method: 'POST', body: { set: 'ashbell-pass' } })).status, 200)
const docs = (await a('/api/documents')).data
const script = docs.find(d => d.name === 'dlg-town-crier.md')
const s05 = (await a('/api/facts?status=pending')).data.find(f => f.subject === 'Rourke' && f.predicate === 'located_at' && f.object === 'Bell Gate')
check('S05 Rourke at the Bell Gate accepted into canon', (await a(`/api/facts/${s05.id}/review`, { method: 'POST', body: { decision: 'accept' } })).data.status, 'canon')

// 1. Upload the sample take: transcript document, timed passages, extraction.
const up = await a('/api/recordings', { method: 'POST', form: audioForm('harl-crier-take.wav', SAMPLE, { script_document_id: script.id }) })
check('recording upload 200', up.status, 200)
const r = up.data.results[0]
check('imported as version 1 with one passage per turn', [r.status, r.version, r.passages], ['imported', 1, FIXTURE.turns.length])
check('duration from the audio', r.duration_ms, FIXTURE.duration_ms)
check('extraction ran on the transcript', r.candidates >= 1, true)
const doc = (await a(`/api/documents/${r.document_id}`)).data
check('kind and origin are recording', [doc.kind, doc.origin], ['recording', 'recording'])
check('the transcript is the recorded turns', doc.content, FIXTURE.turns.map(t => t.text).join('\n\n'))
check('passages keep start/end times', doc.passages.map(p => [p.start_ms, p.end_ms]), FIXTURE.turns.map(t => [t.start_ms, t.end_ms]))
check('the document names its audio, length and script', [doc.recording.audio, doc.recording.duration_ms, doc.recording.script?.id], [`/api/documents/${doc.id}/audio`, FIXTURE.duration_ms, script.id])
const ember = doc.facts.find(f => f.object === 'Ember Well')
check('the ad-libbed fact is a pending candidate (human gate)', ember?.status, 'pending')
const ev = ember.evidence[0]
check('its quote is verbatim in a transcript passage', [ev.verified, doc.passages.find(p => p.id === ev.passage_id).text.includes(ev.quote)], [1, true])
check('the citation carries the turn time', [ev.start_ms, ev.end_ms], [28460, 31420])

// 2. Audio only through the guard, with byte ranges.
const audio = await a(`/api/documents/${doc.id}/audio`)
check('audio served as WAV, byte for byte', [audio.status, audio.headers.get('content-type'), Buffer.compare(audio.data, SAMPLE)], [200, 'audio/wav', 0])
const part = await a(`/api/documents/${doc.id}/audio`, { headers: { range: 'bytes=44-143' } })
check('a byte range is 206 with Content-Range', [part.status, part.data.length, part.headers.get('content-range')], [206, 100, `bytes 44-143/${SAMPLE.length}`])
check('a range past the end is 416', (await a(`/api/documents/${doc.id}/audio`, { headers: { range: `bytes=${SAMPLE.length}-` } })).status, 416)
check('a text document has no audio', (await a(`/api/documents/${script.id}/audio`)).status, 404)

// 3. Script vs recording.
const cmp = (await a(`/api/documents/${doc.id}/script`)).data
check('compared with the latest script', cmp.script.title, script.title)
const line1 = cmp.rows.find(x => x.script?.pieces.map(p => p.text).join('').startsWith('Hear ye'))
check('line 1: "Hear ye, hear ye!" not said, the rest as written', [line1.kind, line1.script.pieces.filter(p => p.mark).map(p => p.text.trim())], ['changed', ['Hear ye, hear ye!']])
const rourke = cmp.rows.find(x => x.script?.pieces.map(p => p.text).join('').includes('Captain Rourke'))
check('the Rourke bark is changed, spoken over two turns', [rourke.kind, rourke.spoken.passages.length, rourke.spoken.start_ms], ['changed', 2, 22620])
check('the ad-lib is marked as inserted words', rourke.spoken.pieces.filter(p => p.mark).map(p => p.text).join('').includes('Ember Well'), true)
const flag = rourke.facts.find(f => f.id === ember.id)?.flags[0]
check('the changed line is flagged against canon', [flag?.rule, flag?.severity, flag?.against.id], ['EXACT_TIME_LOCATION_OVERLAP', 'hard', s05.id])
check('kinds present', ['changed', 'missing', 'added', 'outside'].every(k => cmp.rows.some(x => x.kind === k)), true)
check('only the Rourke line is flagged', cmp.flagged, 1)
check('the canon flag says so', flag?.with, 'canon')
// Two candidates in this take placing someone canon doesn't know at two places at once: flagged "in this take", not canon.
const moth = (pi, quote, object) => a('/api/facts', { method: 'POST', body: { document_id: doc.id, passage_id: doc.passages[pi].id, quote, statement: `Moth is at the ${object} at 21:00 on Day 2.`, subject: 'Moth', predicate: 'located_at', object, time_from: 'D2 21:00', to: 'review' } })
const m1 = (await moth(4, 'at the Ember Well at nine o\'clock', 'Ember Well')).data
const m2 = (await moth(1, 'talk at the foot of the Bell Gate', 'Bell Gate')).data
const cmp2 = (await a(`/api/documents/${doc.id}/script`)).data
const flagsOf = id => cmp2.rows.flatMap(x => x.facts).find(f => f.id === id)?.flags ?? []
const lineOf = (id) => { const x = cmp2.rows.find(r => r.facts.some(f => f.id === id)).spoken; return [x.start_ms, x.end_ms] }
check('in-take clash: Ember Well line cites the Bell Gate line and when it is said', flagsOf(m1.id).map(x => [x.with, x.rule, x.against.id, x.against.status, x.against.line && [x.against.line.start_ms, x.against.line.end_ms]]), [['take', 'EXACT_TIME_LOCATION_OVERLAP', m2.id, 'pending', lineOf(m2.id)]])
check('and the other way round', flagsOf(m2.id).map(x => [x.with, x.against.id, x.against.line && [x.against.line.start_ms, x.against.line.end_ms]]), [['take', m1.id, lineOf(m1.id)]])
check('two different lines', lineOf(m1.id)[0] !== lineOf(m2.id)[0], true)
check('still one line against canon; the in-take clash is counted apart', [cmp2.flagged, cmp2.take_conflicts], [1, 2])
for (const m of [m1, m2]) await a(`/api/facts/${m.id}/review`, { method: 'POST', body: { decision: 'reject', rationale: 'probe' } })
check('rejected: no in-take clash left', (await a(`/api/documents/${doc.id}/script`)).data.take_conflicts, 0)
check('nothing was stored by the comparison', (await a('/api/conflicts?status=all')).data.some?.(c => [c.left_fact_id, c.right_fact_id].includes(ember.id)) ?? false, false)
check('unlink the script', (await a(`/api/documents/${doc.id}/script`, { method: 'POST', body: { script_document_id: null } })).data.script_key, null)
check('unlinked: no rows', (await a(`/api/documents/${doc.id}/script`)).data.script, null)
check('a recording cannot be the script', (await a(`/api/documents/${doc.id}/script`, { method: 'POST', body: { script_document_id: doc.id } })).status, 400)
await a(`/api/documents/${doc.id}/script`, { method: 'POST', body: { script_document_id: script.id } })

// 4. Versions: same audio again is a duplicate; the transcript is never edited by hand.
const again = (await a('/api/recordings', { method: 'POST', form: audioForm('harl-crier-take.wav', SAMPLE) })).data.results[0]
check('the same take again: duplicate transcript, skipped', [again.status, again.same_as?.version], ['duplicate', 1])
check('transcribe again: same text, no new version', (await a(`/api/documents/${doc.id}/transcribe`, { method: 'POST' })).data.status, 'duplicate')
check('the audio is still there', (await a(`/api/documents/${doc.id}/audio`)).status, 200)
check('editing the transcript is refused', (await a('/api/drafts', { method: 'POST', body: { document_id: doc.id } })).status, 409)
const quote = 'Captain Rourke swears he watched the tower'
const human = await a('/api/facts', { method: 'POST', body: { document_id: doc.id, passage_id: doc.passages[3].id, quote, statement: 'Rourke swears he watched the tower.', subject: 'Rourke', predicate: 'swears', to: 'review' } })
check('a person can cite the transcript by selecting words', human.status, 200)

// 5. Recorded mode only knows the sample: other audio is refused, recorded in model_calls, nothing stored.
const before = (await a('/api/documents')).data.length
const tone = await a('/api/recordings', { method: 'POST', form: audioForm('tone.wav', toneWav(2)) })
check('unknown audio in recorded mode: 503, never made-up text', [tone.status, /isn’t available/.test(tone.data.message)], [503, true])
check('nothing stored for it', (await a('/api/documents')).data.length, before)
const calls = (await a('/api/model-calls')).data.filter(c => c.purpose === 'transcribe')
check('every transcription is in model_calls', [calls.some(c => c.status === 'ok'), calls.some(c => c.status === 'failed')], [true, true])
const audit = (await a('/api/audit')).data
check('audit records the recording', (audit.items ?? audit).some(e => e.event_type === 'recording.imported'), true)

// 6. Refusals.
check('unsupported type: 415 with the formats', [(await a('/api/recordings', { method: 'POST', form: audioForm('notes.pdf', Buffer.from('%PDF-1.4')) })).status], [415])
const junk = await a('/api/recordings', { method: 'POST', form: audioForm('broken.mp3', Buffer.from('not really audio at all, just text')) })
check('a file that is not audio: 415, plain message', [junk.status, /MP3, WAV, M4A/.test(junk.data.message)], [415, true])
check('a broken WAV header: 415', (await a('/api/recordings', { method: 'POST', form: audioForm('odd.wav', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40)])) })).status, 415)
const stereo = await a('/api/recordings', { method: 'POST', form: audioForm('stereo.wav', toneWav(1, 44100, 2)) })
check('a stereo 44.1 kHz WAV is converted (ffmpeg), then recorded mode has no transcript for it', [stereo.status, stereo.data.statusMessage], [503, 'MODEL_OFFLINE'])
check('over 64 MB: 413 while streaming (chunked, no length)', await chunkedUpload(a, 70), 413)
const long = await a('/api/recordings', { method: 'POST', form: audioForm('long.wav', toneWav(31 * 60, 16000)) })
check('over 30 minutes: 413 with the limit', [long.status, /30 minutes/.test(long.data.message)], [413, true])
let t0 = Date.now()
const flac = await a('/api/recordings', { method: 'POST', form: audioForm('long.flac', LONG_FLAC) })
check('a 31-minute FLAC is refused from its stated length, before converting', [flac.status, /30 minutes; this one is 31/.test(flac.data.message), Date.now() - t0 < 3000], [413, true, true])
t0 = Date.now()
const webm = await a('/api/recordings', { method: 'POST', form: audioForm('long.webm', LONG_WEBM) })
check('a 31-minute WebM stating no length: conversion stops past 30 minutes, 413', [webm.status, /30 minutes/.test(webm.data.message)], [413, true])
console.log(`    (refused after ${Date.now() - t0} ms)`)
check('empty upload: 400', (await a('/api/recordings', { method: 'POST', form: new FormData() })).status, 400)

// 7. Isolation and roles.
const b = await account('Bea')
const sb = (await b('/api/studios', { method: 'POST', body: { name: 'Other Voice Studio' } })).data
await b('/api/projects', { method: 'POST', body: { name: 'Other', studio_id: sb.id } })
check('other studio: audio 404', (await b(`/api/documents/${doc.id}/audio`)).status, 404)
check('other studio: script diff 404', (await b(`/api/documents/${doc.id}/script`)).status, 404)
check('other studio: transcribe again 404', (await b(`/api/documents/${doc.id}/transcribe`, { method: 'POST' })).status, 404)
check('other studio: link script 404', (await b(`/api/documents/${doc.id}/script`, { method: 'POST', body: { script_document_id: null } })).status, 404)
check('other studio: a foreign script id 404', (await b('/api/recordings', { method: 'POST', form: audioForm('x.wav', SAMPLE, { script_document_id: script.id }) })).status, 404)

const link = (await a('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 1 } })).data
const v = await account('Vic')
await v(`/api/invites/${link.token}/accept`, { method: 'POST' })
await v(`/api/projects/${(await a('/api/me')).data.current.project.id}/switch`, { method: 'POST' })
check('viewer: listens to the audio', (await v(`/api/documents/${doc.id}/audio`)).status, 200)
check('viewer: reads the script diff', (await v(`/api/documents/${doc.id}/script`)).status, 200)
check('viewer: upload 403', (await v('/api/recordings', { method: 'POST', form: audioForm('v.wav', SAMPLE) })).status, 403)
check('viewer: transcribe again 403', (await v(`/api/documents/${doc.id}/transcribe`, { method: 'POST' })).status, 403)
check('viewer: link script 403', (await v(`/api/documents/${doc.id}/script`, { method: 'POST', body: { script_document_id: null } })).status, 403)
const vf = new FormData()
vf.append('audio', new Blob([SAMPLE]), 'clip.wav')
const dict = await v('/api/voice/transcribe', { method: 'POST', body: undefined, form: vf })
check('viewer: may dictate (text only, nothing stored)', [dict.status, dict.data.text?.startsWith('The Red Mule Caravan')], [200, true])
check('nothing stored by dictation', (await a('/api/documents')).data.length, before)

// 8. Hourly audio limits (seconds of audio; a failed transcription counts too). A fresh project so the counts start at 0.
const lim = await account('Lim')
const ls = (await lim('/api/studios', { method: 'POST', body: { name: 'Limit Studio' } })).data
await lim('/api/projects', { method: 'POST', body: { name: 'Limits', studio_id: ls.id } })
const clip = (c, seconds) => {
  const f = new FormData()
  f.append('audio', new Blob([silenceWav(seconds)]), 'clip.wav')
  return c('/api/voice/transcribe', { method: 'POST', form: f })
}
const statuses = []
for (let i = 0; i < 2; i++) statuses.push((await clip(lim, 300)).status)
check('dictation: two 5-minute clips are within 10 minutes an hour (recorded mode has no transcript: 503)', statuses, [503, 503])
const over = await clip(lim, 1)
check('dictation: the next second is 429 per person', [over.status, /Voice input can use up to 10 minutes/.test(over.data.message)], [429, true])
const REC = silenceWav(29 * 60)
const rec = (c, data = REC) => c('/api/recordings', { method: 'POST', form: audioForm('take.wav', data) })
check('recording: 29 minutes is within 45 a person', (await rec(lim)).status, 503)
const recOver = await rec(lim)
check('recording: 29 more would pass 45 minutes: 429 per person', [recOver.status, /Recordings can use up to 45 minutes/.test(recOver.data.message)], [429, true])
const inviteTo = async (role, name) => {
  const l = (await lim('/api/team/invites', { method: 'POST', body: { role, days: 1 } })).data
  const c = await account(name)
  await c(`/api/invites/${l.token}/accept`, { method: 'POST' })
  await c(`/api/projects/${(await lim('/api/me')).data.current.project.id}/switch`, { method: 'POST' })
  return c
}
const eve = await inviteTo('editor', 'Eve')
check('another editor: 29 minutes (project at 39 + 29 = 68 of 90)', (await rec(eve)).status, 503)
check('and 15 more (project at 83, Eve at 44 of 45)', (await rec(eve, silenceWav(15 * 60))).status, 503)
const val = await inviteTo('viewer', 'Val')
check('a viewer dictates 5 minutes (project at 88)', (await clip(val, 300)).status, 503)
const projOver = await clip(val, 300)
check('5 more would pass 90: the project limit, 429, although Val used only 5 minutes', [projOver.status, /This project can transcribe up to 90 minutes/.test(projOver.data.message)], [429, true])
check('the other project is not affected', (await a('/api/voice/transcribe', { method: 'POST', form: vf })).status, 200)

// 9. The take says what a candidate the project already has says (made from another document): extraction makes no second
// candidate. A pending one now cites the transcript too, so its line is still flagged against canon. A rejected one stays as
// the person decided (not cited, not in the comparison, like any rejected candidate of the take).
for (const status of ['pending', 'rejected']) {
  const d = await account(`Dup${status}`)
  const ds = (await d('/api/studios', { method: 'POST', body: { name: `Dup ${status}` } })).data
  await d('/api/projects', { method: 'POST', body: { name: 'Ashbell dup', studio_id: ds.id } })
  await d('/api/demo/load', { method: 'POST', body: { set: 'ashbell-pass' } })
  const dScript = (await d('/api/documents')).data.find(x => x.name === 'dlg-town-crier.md')
  const sp = (await d(`/api/documents/${dScript.id}`)).data.passages.find(p => p.text.length > 60)
  const dS05 = (await d('/api/facts?status=pending')).data.find(f => f.subject === 'Rourke' && f.predicate === 'located_at' && f.object === 'Bell Gate')
  await d(`/api/facts/${dS05.id}/review`, { method: 'POST', body: { decision: 'accept' } })
  const said = FIXTURE.candidates[0]
  const prior = await d('/api/facts', { method: 'POST', body: { document_id: dScript.id, passage_id: sp.id, quote: sp.text.slice(0, 40), statement: said.statement, kind: said.kind, subject: said.subject, predicate: said.predicate, object: said.object, time_from: said.time.from, to: 'review' } })
  check(`${status}: the same statement is already a candidate`, prior.status, 200)
  if (status === 'rejected') await d(`/api/facts/${prior.data.id}/review`, { method: 'POST', body: { decision: 'reject', rationale: 'probe' } })
  const dr = (await d('/api/recordings', { method: 'POST', form: audioForm('harl-crier-take.wav', SAMPLE, { script_document_id: dScript.id }) })).data.results[0]
  check(`${status}: the take adds only its other candidate`, [dr.status, dr.candidates, dr.skipped], ['imported', FIXTURE.candidates.length - 1, 1])
  const same = (await d(`/api/facts?status=${status}`)).data.filter(f => f.statement === said.statement)
  check(`${status}: still one candidate with that statement`, same.map(f => f.id), [prior.data.id])
  const tev = same[0].evidence.find(e => e.document_id === dr.document_id)
  const dDoc = (await d(`/api/documents/${dr.document_id}`)).data
  const dCmp = (await d(`/api/documents/${dr.document_id}/script`)).data
  const dRow = dCmp.rows.find(x => x.facts.some(f => f.id === prior.data.id))
  const dFlag = dRow?.facts.find(f => f.id === prior.data.id).flags[0]
  const added = (await d('/api/audit')).data.filter(e => e.event_type === 'candidate.evidence_added' && e.target_id === prior.data.id)
  if (status === 'pending') {
    check('pending: it now cites the transcript, verbatim', [tev?.verified, dDoc.passages.find(p => p.id === tev?.passage_id)?.text.includes(tev?.quote)], [1, true])
    check('pending: the Rourke line is flagged against canon', [dRow?.script.pieces.map(p => p.text).join('').includes('Captain Rourke'), dFlag?.with, dFlag?.rule, dFlag?.against.id, dCmp.flagged], [true, 'canon', 'EXACT_TIME_LOCATION_OVERLAP', dS05.id, 1])
    check('pending: audited once, with the transcript', added.map(e => e.detail.document_id), [dr.document_id])
  } else {
    check('rejected: the decision stands (not cited, not compared, nothing audited)', [tev, dRow, dCmp.flagged, added.length], [undefined, undefined, 0, 0])
  }
}

console.log('voice probe passed')
