import { ref } from 'vue'

// The one way the app writes dates and times: day month year, 24-hour clock ("30 Oct 2026", "30 Oct 2026, 22:36", "22:36:05").
// The server and the browser can sit in different time zones, so the server render and hydration both use UTC; app.vue
// flips this once the app is mounted and every date re-renders in the reader's own zone. Same text on both sides of hydration.
export const localDates = ref(false)
const DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
const zone = () => ({ timeZone: localDates.value ? undefined : 'UTC' })
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { ...DAY, ...zone() })
export const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { ...DAY, hour: '2-digit', minute: '2-digit', hour12: false, ...zone() })
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, ...zone() })
// The calendar day `n` days before `iso`'s day in the selected zone, formatted like shortDate (DST-safe: no 24 h arithmetic).
export const shortDateBack = (iso: string, n: number) => {
  const [y, m, d] = new Date(iso).toLocaleDateString('en-CA', zone()).split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! - n, 12)).toLocaleDateString('en-GB', { ...DAY, timeZone: 'UTC' })
}
/** A position in a recording: "02:14", or "1:02:14" past an hour. */
export const clockMs = (ms: number) => {
  const s = Math.floor(ms / 1000)
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`
}
