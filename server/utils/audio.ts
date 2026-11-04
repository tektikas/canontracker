import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Audio for Muse Voice Transcribe. The API takes one format only: RIFF/WAVE, mono, 16-bit PCM, 16 or 24 kHz, at most
// 10 minutes and 32 MB per request (dev.meta.ai/docs/speech-to-text). Uploads in other formats are converted with ffmpeg on
// the server; a WAV already in that shape is used as it is (rewritten with a plain 44-byte header). The stored copy is the
// WAV the model heard, so turn timestamps play back exactly.

export const AUDIO_EXTENSIONS = ['wav', 'mp3', 'm4a', 'ogg', 'oga', 'opus', 'webm', 'flac', 'aac'] as const
export const MAX_AUDIO_MS = 30 * 60_000 // one recording; longer than 10 minutes is sent in chunks
export const CHUNK_MS = 9 * 60_000 + 30_000 // under the API's 10-minute cap

const bad = (statusCode: number, statusMessage: string, message: string) => createError({ statusCode, statusMessage, message })
export const UNSUPPORTED = 'Unsupported audio. Upload MP3, WAV, M4A, OGG, WebM or FLAC.'

export interface Wav { rate: number, data: Buffer, duration_ms: number }

/** The PCM inside a WAV, if it is the shape Muse accepts (mono, 16-bit integer PCM, 16 or 24 kHz); otherwise null. */
export function acceptedWav(buf: Buffer): Wav | null {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null
  let fmt: { format: number, channels: number, rate: number, bits: number } | null = null
  for (let at = 12; at + 8 <= buf.length;) {
    const id = buf.toString('ascii', at, at + 4)
    const size = buf.readUInt32LE(at + 4)
    const body = at + 8
    if (id === 'fmt ' && size >= 16 && body + 16 <= buf.length)
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) }
    if (id === 'data') {
      if (!fmt || fmt.format !== 1 || fmt.channels !== 1 || fmt.bits !== 16 || ![16000, 24000].includes(fmt.rate)) return null
      // A streamed WAV may say 0 or 0xFFFFFFFF here: the data then runs to the end of the file.
      const end = size && body + size <= buf.length ? body + size : buf.length
      const data = buf.subarray(body, end - ((end - body) % 2))
      return { rate: fmt.rate, data, duration_ms: Math.round(data.length / 2 / fmt.rate * 1000) }
    }
    at = body + size + (size % 2)
  }
  return null
}

/** A plain WAV file (44-byte header) around 16-bit mono PCM. */
export function wavFile(rate: number, data: Buffer) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0, 'ascii')
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVEfmt ', 8, 'ascii')
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36, 'ascii')
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

// Demuxers ffmpeg may use: plain audio containers only, so a "file" that is really a playlist (HLS, concat) is refused
// instead of being followed to other files or URLs.
const DEMUXERS = 'wav,mp3,mov,ogg,matroska,flac,aac'
const run = (cmd: 'ffmpeg' | 'ffprobe', args: string[]) => new Promise<string>((resolve, reject) =>
  execFile(cmd, ['-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file', '-format_whitelist', DEMUXERS, ...args],
    { timeout: 120_000, maxBuffer: 1_000_000 }, (e, out) => (e ? reject(e) : resolve(out))))
const unreadable = (e: NodeJS.ErrnoException) => {
  if (e.code === 'ENOENT') throw bad(415, 'UNSUPPORTED', 'This server cannot convert audio (ffmpeg is not installed). Upload a mono 16-bit WAV at 16 or 24 kHz.')
  throw bad(415, 'UNSUPPORTED', `${UNSUPPORTED} This file could not be read as audio.`)
}

/** Any supported upload as the WAV Muse takes. A WAV already in that shape skips ffmpeg. Long audio is refused before any
 * heavy work: the length the container states (ffprobe) is checked first, and the conversion itself stops just past
 * `maxMs` (and at that much WAV), for files that state no length or a wrong one. */
export async function toMuseWav(input: Buffer, filename: string, { maxMs = MAX_AUDIO_MS, tooLong }: { maxMs?: number, tooLong?: string } = {}): Promise<Wav & { file: Buffer, sha256: string }> {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (!(AUDIO_EXTENSIONS as readonly string[]).includes(ext)) throw bad(415, 'UNSUPPORTED', UNSUPPORTED)
  const long = (ms: number) => bad(413, 'TOO_LONG', tooLong ?? `Recordings can be up to ${maxMs / 60_000} minutes; this one is ${Math.ceil(ms / 60_000)}.`)
  let wav = acceptedWav(input)
  if (!wav) {
    const dir = mkdtempSync(join(tmpdir(), 'sb-audio-'))
    try {
      writeFileSync(join(dir, 'in'), input)
      const stated = Number.parseFloat(await run('ffprobe', ['-show_entries', 'format=duration', '-of', 'csv=p=0', join(dir, 'in')]).catch(unreadable)) * 1000
      if (stated > maxMs) throw long(stated)
      const capS = maxMs / 1000 + 1 // one second over, so a longer file still comes out longer than the limit
      await run('ffmpeg', ['-nostdin', '-i', join(dir, 'in'), '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', '-map_metadata', '-1',
        '-fflags', '+bitexact', '-flags:a', '+bitexact', '-t', String(capS), '-fs', String(44 + capS * 48_000), '-y', join(dir, 'out.wav')]).catch(unreadable)
      wav = acceptedWav(readFileSync(join(dir, 'out.wav')))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    if (!wav) throw bad(415, 'UNSUPPORTED', UNSUPPORTED)
  }
  if (!wav.data.length) throw bad(422, 'NO_AUDIO', 'The file has no audio.')
  if (wav.duration_ms > maxMs) throw long(wav.duration_ms)
  const file = wavFile(wav.rate, wav.data)
  return { ...wav, file, sha256: createHash('sha256').update(file).digest('hex') }
}

/** Pieces of at most CHUNK_MS, each a WAV of its own, with where it starts in the whole recording. */
export function wavChunks(w: Wav) {
  const step = Math.floor(w.rate * CHUNK_MS / 1000) * 2
  const out: { offset_ms: number, file: Buffer }[] = []
  for (let at = 0; at < w.data.length; at += step)
    out.push({ offset_ms: Math.round(at / 2 / w.rate * 1000), file: wavFile(w.rate, w.data.subarray(at, at + step)) })
  return out
}

// One turn per passage: whitespace folded to single spaces, a leading # dropped (it would turn the passage into a heading).
const cleanTurn = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/^#+\s*/, '')
export interface Turn { start_ms: number, end_ms: number, text: string, speaker: string | null }
/** The transcript document's text: one paragraph per turn, so splitPassages gives exactly one passage per kept turn. */
export function transcriptOf(turns: Turn[]) {
  const kept = turns.map(t => ({ ...t, text: cleanTurn(t.text) })).filter(t => t.text)
  return { content: kept.map(t => t.text).join('\n\n'), turns: kept }
}

// Transcription is paid per second of audio: hourly limits in seconds of audio per person (dictation and recordings apart)
// and per project. ponytail: per-process counters (throttle.ts), a restart forgets them; a shared store for several nodes.
const HOUR = 3_600_000
export const AUDIO_LIMIT_MIN = { dictation: 10, recording: 45, project: 90 }
const perUser = { dictation: fixedWindow(AUDIO_LIMIT_MIN.dictation * 60, HOUR), recording: fixedWindow(AUDIO_LIMIT_MIN.recording * 60, HOUR) }
const perProject = fixedWindow(AUDIO_LIMIT_MIN.project * 60, HOUR)

/** Counts `ms` of audio against the hourly limits, or refuses with 429 and counts nothing. `ms = 0` only checks that a
 * limit isn't used up already (before reading and converting an upload). A failed transcription still counts. */
export function spendAudio(kind: 'dictation' | 'recording', ms: number) {
  const s = Math.ceil(ms / 1000)
  const { user, project } = access()
  const later = (w: number) => { const m = Math.ceil(w / 60_000); return `Try again in ${m} minute${m === 1 ? '' : 's'}.` }
  let wait = perUser[kind](user.id, s, false)
  if (wait) throw bad(429, 'TOO_MANY_REQUESTS', `${kind === 'dictation' ? 'Voice input' : 'Recordings'} can use up to ${AUDIO_LIMIT_MIN[kind]} minutes of audio per person per hour. ${later(wait)}`)
  wait = perProject(project.id, s, false)
  if (wait) throw bad(429, 'TOO_MANY_REQUESTS', `This project can transcribe up to ${AUDIO_LIMIT_MIN.project} minutes of audio per hour. ${later(wait)}`)
  if (s) {
    perUser[kind](user.id, s)
    perProject(project.id, s)
  }
}

export const recordingDir = (projectId = pid()) => join('.data', 'recordings', projectId)
export const audioPath = (sha256: string, projectId = pid()) => join(recordingDir(projectId), `${sha256}.wav`)
export function storeAudio(sha256: string, file: Buffer) {
  mkdirSync(recordingDir(), { recursive: true })
  if (!existsSync(audioPath(sha256))) writeFileSync(audioPath(sha256), file)
}
export const removeAudioIfUnused = (sha256: string) => {
  if (!useDb().prepare('select 1 from recordings where project_id = ? and audio_sha256 = ?').get(pid(), sha256)) rmSync(audioPath(sha256), { force: true })
}

/** Names the project already knows (wiki pages and their aliases), sent as recognition hints so invented names come out
 * spelled the way the story spells them. A hint, not a guarantee. Muse refuses keywords over 30 characters: see transcriptionHints. */
export function transcriptionKeywords() {
  const { counts } = canonNameCounts()
  return transcriptionHints(listEntities().map((e) => {
    const names = namesOf(e)
    return { title: e.name, names, facts: [...new Set(names.map(normName))].reduce((n, k) => n + (counts.get(k) ?? 0), 0) }
  }))
}

export interface RecordingRow {
  document_id: string, audio_sha256: string, bytes: number, duration_ms: number, original_name: string, model_id: string, mode: string
  session_ids: string, script_key: string | null, created_by: string, created_at: string, project_id: string
}
export const getRecording = (documentId: string) =>
  useDb().prepare('select * from recordings where document_id = ? and project_id = ?').get(documentId, pid()) as unknown as RecordingRow | undefined

/** Transcribe a recording and add the transcript as a document version (importDocument: hash, versions, passages with the
 * turns' times, extraction). `name`/`folderId` pick the document like an upload does: the same name in the same folder is
 * its next version. Nothing is stored when transcription fails. */
export async function importRecording(name: string, wav: Wav & { file: Buffer, sha256: string }, opts: { folderId: string | null, scriptKey: string | null, target: { type: string, id: string }, background?: boolean }) {
  const t = await transcribeAudio(wav, opts.target)
  const { content, turns } = transcriptOf(t.turns)
  storeAudio(wav.sha256, wav.file)
  try {
    const r = await importDocument(name, content, undefined, opts.folderId, {
      turns, audio_sha256: wav.sha256, bytes: wav.file.length, duration_ms: wav.duration_ms, original_name: name,
      model_id: transcribeModelInfo().id, mode: t.mode, session_ids: t.session_ids, script_key: opts.scriptKey,
    }, undefined, undefined, opts.background)
    return { ...r, duration_ms: wav.duration_ms }
  } finally {
    removeAudioIfUnused(wav.sha256) // a duplicate transcript or a failed import leaves no audio behind
  }
}

/** The script a recording is compared with, by document id (any version of it); null clears the link. */
export function scriptKeyOf(id: unknown) {
  if (id == null || id === '') return null
  const doc = typeof id === 'string' ? useDb().prepare('select filename, origin from documents where id = ? and project_id = ?').get(id, pid()) as { filename: string, origin: string } | undefined : undefined
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'Script document not found.' })
  if (doc.origin === 'recording') throw createError({ statusCode: 400, statusMessage: 'INVALID', message: 'Pick a script, not another recording.' })
  return doc.filename
}
