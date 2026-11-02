import type { H3Event } from 'h3'

const bad = (statusMessage: string, message: string) => createError({ statusCode: 400, statusMessage, message })

/** Read the raw request body into memory with a hard cap enforced while it streams in (Content-Length can be absent or
 * wrong with chunked encoding): over `max` bytes is a 413 and the connection is closed. h3's readBody and toWebRequest
 * then read the buffered copy. No-op for methods without a body. */
export async function readLimitedBody(event: H3Event, max: number, message = 'The request is too large.') {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method) || event._requestBody) return
  const tooLarge = () => {
    setResponseHeader(event, 'connection', 'close')
    return createError({ statusCode: 413, statusMessage: 'TOO_LARGE', message })
  }
  if (Number(getRequestHeader(event, 'content-length') ?? 0) > max) throw tooLarge()
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of event.node.req.iterator({ destroyOnReturn: false }) as AsyncIterable<Buffer>) {
    total += chunk.length
    if (total > max) throw tooLarge()
    chunks.push(chunk)
  }
  event._requestBody = Buffer.concat(chunks)
}

/** A JSON request body as an object: an empty body reads as {}, and anything that is not a JSON object (null, an array, a
 * string, a number) is a 400, so a handler can read fields off it without crashing. Fields are still unchecked `unknown`s. */
export async function readObject<T extends object = Record<string, unknown>>(event: H3Event): Promise<{ [K in keyof T]?: unknown }> {
  const body: unknown = await readBody(event)
  if (body === undefined || body === '') return {}
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('BAD_BODY', 'Send a JSON object.')
  return body as { [K in keyof T]?: unknown }
}

/** An optional text field, trimmed: '' when missing; a 400 when it is not text or longer than `max` characters. */
export function optText(v: unknown, what: string, max: number) {
  if (v == null) return ''
  if (typeof v !== 'string') throw bad('INVALID', `${what} must be text.`)
  const s = v.trim()
  if (s.length > max) throw bad('TOO_LONG', `Keep the ${what.toLowerCase()} under ${max.toLocaleString('en')} characters.`)
  return s
}

/** An id from the body: a string, or '' (never an object that would reach SQL). */
export const idOf = (v: unknown) => (typeof v === 'string' ? v : '')
