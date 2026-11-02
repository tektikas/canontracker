import { readFileSync, existsSync } from 'node:fs'

// A recording's audio, only through the project guard (another studio gets 404, like the document). Byte ranges are served
// so the player can seek to a passage's time.
export default defineEventHandler((event) => {
  const rec = getRecording(getRouterParam(event, 'id')!)
  const path = rec && audioPath(rec.audio_sha256)
  if (!rec || !existsSync(path!)) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: 'No recording for this document.' })
  const data = readFileSync(path!)
  setResponseHeaders(event, { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' })
  const m = getRequestHeader(event, 'range')?.match(/^bytes=(\d*)-(\d*)$/)
  if (!m || (!m[1] && !m[2])) return data
  // bytes=a-b, bytes=a- or the last n bytes (bytes=-n)
  const start = m[1] ? Number(m[1]) : Math.max(0, data.length - Number(m[2]))
  const end = m[1] && m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1
  if (start >= data.length || start > end) {
    setResponseStatus(event, 416)
    setResponseHeader(event, 'content-range', `bytes */${data.length}`)
    return ''
  }
  setResponseStatus(event, 206)
  setResponseHeader(event, 'content-range', `bytes ${start}-${end}/${data.length}`)
  return data.subarray(start, end + 1)
})
