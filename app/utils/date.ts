// The one way the app writes dates and times: day month year, 24-hour clock ("30 Oct 2026", "30 Oct 2026, 22:36", "22:36:05").
const DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', DAY)
export const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { ...DAY, hour: '2-digit', minute: '2-digit', hour12: false })
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
