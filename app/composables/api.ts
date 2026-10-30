export const errorMessage = (e: unknown) => {
  const err = e as { data?: { message?: string, statusMessage?: string }, message?: string }
  return err.data?.message || err.data?.statusMessage || err.message || 'Request failed'
}

export const percent = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 100)}%`)
