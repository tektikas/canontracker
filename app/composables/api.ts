// The API's own message when it sent one. A failure with only a status (a proxy page, an empty 502/503) or no response at
// all gets a plain sentence instead of the raw fetch text ('[PUT] "/api/…": 503 Service Unavailable').
export const errorMessage = (e: unknown) => {
  const err = e as { data?: unknown, message?: string, statusCode?: number, status?: number, name?: string }
  const data = err.data && typeof err.data === 'object' ? err.data as { message?: string, statusMessage?: string } : undefined
  if (data?.message || data?.statusMessage) return (data.message || data.statusMessage)!
  const status = err.statusCode ?? err.status
  if (status) return `The server didn’t respond (${status}).`
  if (err.name === 'FetchError') return 'Couldn’t reach the server. Check your connection.'
  return err.message || 'Something went wrong.'
}

export const percent = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 100)}%`)
