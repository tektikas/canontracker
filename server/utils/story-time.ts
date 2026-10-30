// Story time is "D<day> HH:MM", stored as minutes since Day 1 00:00.
export function parseStoryTime(label?: string | null) {
  const m = label?.match(/^D(\d+)\s+(\d{1,2}):(\d{2})$/)
  return m ? (Number(m[1]) - 1) * 1440 + Number(m[2]) * 60 + Number(m[3]) : null
}

export function formatStoryTime(t: number) {
  const day = Math.floor(t / 1440) + 1
  const mins = t % 1440
  return `D${day} ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

export function timeLabel(from: number | null, to: number | null, precision?: string | null) {
  if (from == null && to == null) return null
  const range = from != null && to != null ? `${formatStoryTime(from)} – ${formatStoryTime(to)}`
    : from != null ? formatStoryTime(from) : `until ${formatStoryTime(to!)}`
  return precision === 'approximate' ? `~ ${range}` : range
}
