import type { H3Event } from 'h3'

export type FormLimits = {
  maxTotal: number // whole body, bytes
  maxPart: number // any one part (file or field), bytes
  maxParts: number // part markers, including the closing one
  maxField: number // a part without a filename, bytes
  tooLarge: string
  notMultipart: string
}

// Read a multipart form with hard limits enforced while the body streams in, so an oversized or endless request is cut
// off with 413 before it is held in memory. Only then does h3 parse the (bounded) body. Use this for every upload route.
export async function readLimitedForm(event: H3Event, lim: FormLimits) {
  const tooLarge = () => {
    setResponseHeader(event, 'connection', 'close') // don't read the rest of the body: close once the 413 is sent
    return createError({ statusCode: 413, statusMessage: 'TOO_LARGE', message: lim.tooLarge })
  }
  const boundary = getHeader(event, 'content-type')?.match(/^multipart\/form-data;.*boundary=("[^"]*"|[^;]*)(;|$)/i)?.[1]?.replace(/^"|"$/g, '')
  if (!boundary) throw createError({ statusCode: 400, statusMessage: 'INVALID', message: lim.notMultipart })
  // h3's parser takes the boundary literally: hand it the unquoted form (a quoted boundary is valid, RFC 2046).
  event.node.req.headers['content-type'] = `multipart/form-data; boundary=${boundary}`
  if (Number(getHeader(event, 'content-length') ?? 0) > lim.maxTotal) throw tooLarge()
  const marker = Buffer.from(`--${boundary}`)
  const chunks: Buffer[] = []
  let total = 0, markers = 0, inPart = 0, tail = Buffer.alloc(0)
  for await (const chunk of event.node.req.iterator({ destroyOnReturn: false }) as AsyncIterable<Buffer>) {
    // Count part markers in this chunk plus the end of the previous one (a marker can straddle two chunks).
    const seen = Buffer.concat([tail, chunk])
    let last = -1
    for (let at = seen.indexOf(marker); at !== -1; at = seen.indexOf(marker, at + marker.length)) { markers++; last = at }
    total += chunk.length
    inPart = last === -1 ? inPart + chunk.length : seen.length - last - marker.length
    if (total > lim.maxTotal || inPart > lim.maxPart || markers > lim.maxParts) throw tooLarge()
    chunks.push(chunk)
    tail = seen.subarray(Math.max(0, seen.length - marker.length + 1))
  }
  event._requestBody = Buffer.concat(chunks)
  const form = await readMultipartFormData(event) ?? []
  if (form.some(p => p.filename === undefined && p.data.length > lim.maxField)) throw tooLarge()
  return form
}
