import type { H3Event } from 'h3'

const bad = (statusMessage: string, message: string) => createError({ statusCode: 400, statusMessage, message })

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
